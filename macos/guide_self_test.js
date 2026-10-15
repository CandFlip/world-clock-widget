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
        if (!sample.closest('figure')) {
          // Older WebKit returns local, unzoomed client rects for CSS zoom.
          // The unzoomed parent gives the displayed width in page coordinates.
          const coordinateScale=sample.getBoundingClientRect().width/rect.width;
          const shownHeight=rect.height*coordinateScale;
          check(shownHeight<=parseFloat(getComputedStyle(sample.closest('p,li')).lineHeight)+1,`Tall inline illustration ${JSON.stringify({id,key:sample.dataset.guideControl,language,theme,scale,height:rect.height,shownHeight,line:getComputedStyle(sample.closest('p,li')).lineHeight,coordinateScale})}`);
        }
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
    const host=document.querySelector('.feature-card[open] .feature-content'),probe=document.createElement('p');
    probe.style.maxWidth='240px';
    probe.innerHTML=guideText('Text [[add]] text [[cityPlus]] text [[favorite]] text [[unfavorite]] text [[periodSwitch]] text [[alarm]] text [[interval]] text [[delete]] text');host.append(probe);
    const walker=document.createTreeWalker(probe,NodeFilter.SHOW_TEXT),ys=[];
    while(walker.nextNode()) {
      if(walker.currentNode.parentElement.closest('.guide-control'))continue;
      const range=document.createRange();range.selectNodeContents(walker.currentNode);
      for(const rect of range.getClientRects())ys.push(rect.top);
    }
    const rows=[...new Set(ys.map(y=>Math.round(y*10)/10))].sort((a,b)=>a-b),line=parseFloat(getComputedStyle(probe).lineHeight);
    check(rows.length>1,'Multiline probe');
    check(rows.slice(1).every((y,i)=>Math.abs((y-rows[i])/line-Math.round((y-rows[i])/line))<.04),`Uneven text rhythm ${JSON.stringify({language,theme,scale,rows,line})}`);
    probe.remove();
    openFeatureGuide();
    check(document.querySelectorAll('.feature-guide details[open]').length===0,'New entry collapsed after return');
    closeModal();
  }
  config.settings.language='ru';config.settings.theme='dark';config.settings.interface_scale=125;render();applyInterfaceScale();await pause(120);openFeatureGuide();
  const finalTopic=document.querySelector('[data-guide-topic=cities]');finalTopic.closest('.feature-group').open=true;finalTopic.open=true;await pause(120);
  document.querySelector('.modal-body').scrollTop+=finalTopic.getBoundingClientRect().top-document.querySelector('.modal-body').getBoundingClientRect().top-8;
  return {state:'pass',topics,scales:[100,125,200],languages:['ru','en'],themes:['dark','light'],returnState:true,inlineLayout:true};
})().then(result => {window.__guideSelfTest=result;}, error => {window.__guideSelfTest={state:'fail',message:String(error),stack:error.stack};});
void 0;
