const curriculum = require('../../data/curriculum.json');
const gradeOrder = [6, 5, 4, 3, 2, 1];

Page({
  data: { grades: [], stars: 0 },

  onShow() {
    const grades = gradeOrder.map((id) => ({ id, ...curriculum[id] }));
    this.setData({ grades, stars: Number(wx.getStorageSync('fxxy-stars') || 0) });
  },

  startDaily() {
    wx.navigateTo({ url: '/pages/practice/practice?grade=0' });
  },

  startGrade(event) {
    const grade = Number(event.currentTarget.dataset.grade);
    wx.navigateTo({ url: `/pages/practice/practice?grade=${grade}` });
  }
});
