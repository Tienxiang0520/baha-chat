export const COMMAND_SUGGESTIONS = [
  {
    name: '/poll',
    template: '/poll 問題 | 選項一 | 選項二',
    description: '發起話題投票'
  },
  {
    name: '/announce',
    template: '/announce 標題 | 內容',
    description: '發布系統公告'
  },
  {
    name: '/rename',
    template: '/rename 新名稱',
    description: '重新命名房間'
  },
  {
    name: '/private',
    template: '/private 密碼',
    description: '將房間改為密碼保護'
  },
  {
    name: '/public',
    template: '/public',
    description: '將房間改回公開'
  },
  {
    name: '/clear',
    template: '/clear',
    description: '清空目前房間紀錄'
  },
  {
    name: '/delete',
    template: '/delete',
    description: '刪除目前房間'
  },
  {
    name: '/kick',
    template: '/kick 使用者ID',
    description: '將特定使用者踢出房間'
  },
  {
    name: '/ban',
    template: '/ban 使用者ID',
    description: '封鎖特定使用者'
  },
  {
    name: '/mute',
    template: '/mute 使用者ID 分鐘',
    description: '暫時禁言使用者'
  },
  {
    name: '/adminkey',
    template: '/adminkey',
    description: '重新顯示管理金鑰'
  },
  {
    name: '/auth',
    template: '/auth 管理金鑰',
    description: '用金鑰恢復房主管理權'
  },
  {
    name: '/login',
    template: '/login 密碼',
    description: '登入管理模式'
  },
  {
    name: '/logout',
    template: '/logout',
    description: '登出管理模式'
  },
  {
    name: '/canvas',
    template: '/canvas',
    description: '分享白板連結'
  },
  {
    name: '/roll',
    template: '/roll',
    description: '擲骰子'
  },
  {
    name: '/party',
    template: '/party',
    description: '全畫面碎紙花效果'
  },
  {
    name: '/quake',
    template: '/quake',
    description: '全畫面震動效果'
  }
];
