// 매일 새벽 실행: 수집 → 순위 → 게시 문구 → 영상 제작
const { main, log, env } = require('./lib/common');
main('일일 제작', async () => {
  log(`=== 일일 제작 시작 (TEST_MODE=${env.TEST_MODE}) ===`);
  await require('./collect').collect();
  require('./rank').rank();
  await require('./meta').buildMeta();
  await require('./render').render({ stills: [1.5, 5, 28.5] });
  log('=== 일일 제작 완료 ===');
});
