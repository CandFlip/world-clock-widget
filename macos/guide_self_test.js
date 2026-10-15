// Runs only in the native host's isolated self-test process, never in user data.
window.__guideSelfTest = {state:'pending'};
(async () => {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  await document.fonts.ready;
  reminders.entries = [];
  let topics = 0;
  for (const language of ['ru','en']) for (const theme of ['dark','light']) for (const scale of [100,125,200]) {
    config.settings.language=language; config.settings.theme=theme;
    config.settings.interface_scale=scale; config.settings.interface_scale_default=false;
    render(); applyInterfaceScale(); await pause(120); openFeatureGuide();
    check(document.querySelectorAll('.feature-guide details[open]').length===0,'Fresh guide must be collapsed');
    for (const [id] of featureGuideItems()) {
      const topic=document.querySelector(`[data-guide-topic="${id}"]`);
      topic.closest('.feature-group').open=true; topic.open=true; await pause(35);
      check(document.querySelectorAll('.feature-group[open]').length===1,'One section');
      check(document.querySelectorAll('.feature-card[open]').length===1,'One topic');
      const body=document.querySelector('.modal-body');
      check(body.scrollWidth<=body.clientWidth+1,`Overflow ${language}/${theme}/${scale}/${id}`);
      for (const sample of topic.querySelectorAll('.guide-control')) {
        const visual=sample.querySelector('.guide-control-visual'),rect=visual.getBoundingClientRect();
        check(rect.width>0 && rect.height>0,`Missing illustration ${id}`);
        check(!visual.querySelector('[id],[data-action],[data-city-action]') && visual.inert,'Safe illustration');
        if (!sample.closest('figure')) check(rect.height<=parseFloat(getComputedStyle(sample.closest('p,li')).lineHeight)+1,`Tall inline illustration ${JSON.stringify({id,key:sample.dataset.guideControl,language,theme,scale,height:rect.height,line:getComputedStyle(sample.closest('p,li')).lineHeight,zoom:getComputedStyle(visual).zoom,offsetHeight:visual.offsetHeight,devicePixelRatio,viewport:[innerWidth,innerHeight]})}`);
      }
      body.scrollTop += topic.getBoundingClientRect().top-body.getBoundingClientRect().top-8;
      const before={section:topic.closest('.feature-group').dataset.guideSection,topic:id,scroll:body.scrollTop};
      topic.querySelector('[data-feature]').click(); await pause(30);
      check(!!document.querySelector('#featureTourBack'),`Missing tip ${id}`);
      document.querySelector('#featureTourBack').click(); await pause(40);
      check(document.querySelector('.feature-group[open]')?.dataset.guideSection===before.section,'Return section');
      check(document.querySelector('.feature-card[open]')?.dataset.guideTopic===before.topic,'Return topic');
      check(Math.abs(document.querySelector('.modal-body').scrollTop-before.scroll)<1,`Return scroll ${id}`);
      topics++;
    }
    openFeatureGuide();
    check(document.querySelectorAll('.feature-guide details[open]').length===0,'New entry collapsed after return');
    closeModal();
  }
  return {state:'pass',topics,scales:[100,125,200],languages:['ru','en'],themes:['dark','light'],returnState:true,inlineLayout:true};
})().then(result => {window.__guideSelfTest=result;}, error => {window.__guideSelfTest={state:'fail',message:String(error),stack:error.stack};});
void 0;
