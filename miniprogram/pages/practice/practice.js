const curriculum = require('../../data/curriculum.json');
const gradeOrder = [6, 5, 4, 3, 2, 1];

function shuffle(list) {
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

Page({
  data: {
    items: [], index: 0, current: null, total: 8,
    standardReady: false, voiceHeard: false, canNext: false,
    listening: false, done: false, meter: 4,
    status: '先播放并听完标准音，再开始跟读。'
  },

  onLoad(options) {
    const grade = Number(options.grade || 0);
    const pool = grade
      ? curriculum[grade].items.map((item) => ({ en: item[0], zh: item[1], emoji: item[3], grade }))
      : gradeOrder.flatMap((id) => curriculum[id].items.map((item) => ({ en: item[0], zh: item[1], emoji: item[3], grade: id })));
    this._items = shuffle(pool).slice(0, 8);
    this._audio = wx.createInnerAudioContext();
    this._recorder = wx.getRecorderManager();
    this._audio.onEnded(() => this.onStandardEnded());
    this._audio.onError(() => this.tryNextAudioSource());
    this._recorder.onFrameRecorded((event) => this.onAudioFrame(event));
    this._recorder.onError((error) => this.onRecorderError(error));
    this._recorder.onStop(() => { this._recording = false; });
    this.showQuestion();
  },

  showQuestion() {
    const current = this._items[this.data.index];
    this._standardReady = false;
    this._voiceHeard = false;
    this._attempt = 0;
    this.setData({
      current, standardReady: false, voiceHeard: false, canNext: false,
      listening: false, meter: 4,
      status: '先播放并听完标准音，再开始跟读。'
    });
  },

  playStandard() {
    if (!this.data.current || this.data.listening) return;
    this._audio.stop();
    this._attempt = 0;
    this.setData({ status: '正在播放标准音，请听完整句子。' });
    this.playAudioSource();
  },

  playAudioSource() {
    const text = encodeURIComponent(this.data.current.en);
    const sources = [
      `https://translate.googleapis.com/translate_tts?client=gtx&sl=en&tl=en&dt=t&q=${text}`,
      `https://dict.youdao.com/dictvoice?audio=${text}&type=2`
    ];
    if (this._attempt >= sources.length) {
      this.setData({ status: '标准音暂时无法播放，请检查网络或在小程序后台配置音频域名后重试。' });
      return;
    }
    this._audio.src = sources[this._attempt];
    this._audio.play();
  },

  tryNextAudioSource() {
    this._attempt += 1;
    this.playAudioSource();
  },

  onStandardEnded() {
    this._standardReady = true;
    this.setData({
      standardReady: true,
      canNext: this._voiceHeard,
      status: this._voiceHeard
        ? '听到你的跟读啦！可以进入下一句。'
        : '标准音播放完成。点击「开始跟读」，读出本句后才能继续。'
    });
  },

  startFollow() {
    if (!this._standardReady) {
      wx.showToast({ title: '先听完标准音哦', icon: 'none' });
      return;
    }
    wx.getSetting({
      success: (result) => {
        if (result.authSetting['scope.record']) {
          this.beginRecording();
          return;
        }
        wx.authorize({
          scope: 'scope.record',
          success: () => this.beginRecording(),
          fail: () => this.askOpenSettings()
        });
      },
      fail: () => wx.showToast({ title: '读取麦克风权限失败', icon: 'none' })
    });
  },

  askOpenSettings() {
    wx.showModal({
      title: '需要麦克风权限',
      content: '开启麦克风后，小程序才能在本机检测你是否开口跟读。录音不会上传。',
      confirmText: '去设置',
      success: (result) => {
        if (result.confirm) wx.openSetting({ success: (setting) => {
          if (setting.authSetting['scope.record']) this.beginRecording();
        } });
      }
    });
  },

  beginRecording() {
    this._recording = true;
    this._voiceFrames = 0;
    this.setData({ listening: true, status: '麦克风已开启，请清楚地读出上面的英语句子。' });
    try {
      this._recorder.start({
        duration: 30000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 256000,
        format: 'PCM',
        frameSize: 4
      });
    } catch (error) {
      this._recording = false;
      this.setData({ listening: false, status: '麦克风启动失败，请检查设备权限后重试。' });
    }
  },

  onAudioFrame(event) {
    if (!this._recording || !event.frameBuffer) return;
    const samples = new Int16Array(event.frameBuffer);
    if (!samples.length) return;
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const value = samples[i] / 32768;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / samples.length);
    this.setData({ meter: Math.min(100, Math.max(4, Math.round(rms * 900))) });
    if (rms > 0.028) this._voiceFrames += 1;
    else if (rms < 0.012) this._voiceFrames = 0;
    if (this._voiceFrames >= 3 && !this._voiceHeard) {
      this._voiceHeard = true;
      this.setData({ voiceHeard: true, canNext: this._standardReady, status: '听到你的跟读啦！可以进入下一句。' });
      this.stopRecording();
      wx.showToast({ title: '跟读成功！', icon: 'success' });
    }
  },

  onRecorderError() {
    this._recording = false;
    this.setData({ listening: false, status: '麦克风暂不可用，请检查授权和设备设置后重试。' });
  },

  stopRecording() {
    if (this._recording) {
      this._recorder.stop();
      this._recording = false;
    }
    if (this.data.listening) this.setData({ listening: false });
  },

  nextQuestion() {
    if (!this._standardReady || !this._voiceHeard) {
      wx.showToast({ title: this._standardReady ? '请开口读出本句' : '先听完标准音哦', icon: 'none' });
      return;
    }
    this.stopRecording();
    if (this.data.index + 1 >= this._items.length) {
      this.setData({ done: true, current: null });
      wx.setStorageSync('fxxy-stars', Number(wx.getStorageSync('fxxy-stars') || 0) + 8);
      return;
    }
    this.setData({ index: this.data.index + 1 }, () => this.showQuestion());
  },

  finish() {
    this.stopRecording();
    wx.navigateBack({ delta: 1 });
  },

  onHide() {
    this.stopRecording();
    if (this._audio) this._audio.stop();
  },

  onUnload() {
    if (this._recording) this._recorder.stop();
    this._recording = false;
    if (this._audio) this._audio.destroy();
  }
});
