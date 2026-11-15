(function(){
  'use strict';
  const groups=[
    {id:'listen',title:'Слушать и говорить',description:'Понимать речь и повторять вслух',items:[
      ['sentences','Разбери предложение','Слушаем целиком и по смысловым кускам','feature'],
      ['audio_meaning','Понять предложение','Слушаем и выбираем смысл'],
      ['numeric','Числа, даты и время','Слушаем и отвечаем цифрами','feature'],
      ['audio','Узнать слово','Слушаем и выбираем написание'],
      ['audio_assemble','Собрать услышанное','Расставляем части предложения'],
      ['dictation','Аудиодиктант','Записываем услышанное по-тибетски'],
      ['lrztp','Буквы и слоги на слух','Узнаём произношение и разбор букв']
    ]},
    {id:'words',title:'Слова и письмо',description:'Запоминать слова, читать и писать',items:[
      ['bo_ru','Тибетский → русский','Выбираем значение слова'],
      ['ru_bo','Русский → тибетский','Вспоминаем тибетское слово'],
      ['wylie','Слово и Вайли','Разбираем написание'],
      ['count','Сколько слогов','Считаем части слова'],
      ['inside','Найти слог','Узнаём слог в слове'],
      ['assemble','Собрать слово','Расставляем слоги'],
      ['positions','Надписные и подписные','Определяем положение букв'],
      ['context','Пропущенное слово','Вставляем слово в предложение']
    ]},
    {id:'grammar',title:'Грамматика',description:'Строить фразы и выбирать формы',items:[
      ['particles','Частицы','Понимаем связь и написание'],
      ['honorific','Обычная и почтительная форма','Выбираем по ситуации'],
      ['verb_form','Вербалайзер: форма','Выбираем вторую часть'],
      ['verb_translate','Вербалайзер: перевод','Понимаем всё сочетание'],
      ['relations','Синонимы и антонимы','Находим смысловую пару'],
      ['spatial','Предлоги','Выбираем, переводим и пишем'],
      ['numbers','Числа словами','Пишем числа, даты и время по-тибетски']
    ]}
  ];
  let root,shell,hub,nav,category=groups[0],stage='home',routing=false;
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function button(text,fn,cls){const b=el('button',cls||'su-button',text);b.type='button';b.addEventListener('click',fn);return b;}
  function stop(){
    document.dispatchEvent(new CustomEvent('tws:practice-stop'));
    const active=root.querySelector('[data-audio-stop]');if(active&&!active.disabled)active.click();
    const close=root.querySelector('[data-af-close]');
    if(root.dataset.audioFeatureMode && close)close.click();
    const pause=root.querySelector('#tws-mix-pause');if(pause&&!pause.hidden&&!pause.disabled)pause.click();
  }
  function setStage(value){stage=value;root.dataset.simpleStage=value;hub.hidden=value==='task';nav.hidden=value!=='task';}
  function home(){
    stop();setStage('home');root.dataset.simpleMixed='false';hub.replaceChildren();
    hub.appendChild(el('h3','su-title','Что потренируем?'));
    const quick=el('section','su-quick');
    const text=el('div');text.append(el('strong','','Короткое занятие'),el('p','','10 заданий · примерно 5–10 минут'));
    const start=button('Начать',()=>startMixed(),'su-button su-primary');start.dataset.suMixed='';
    quick.append(text,start);hub.appendChild(quick);
    const cards=el('div','su-categories');
    groups.forEach(g=>{
      const b=button('',()=>choose(g),'su-category');b.dataset.suCategory=g.id;
      b.append(el('strong','',g.title),el('span','',g.description),el('span','su-arrow','→'));cards.appendChild(b);
    });hub.appendChild(cards);
  }
  function row(item){
    const b=button('',()=>start(item),'su-exercise');b.dataset.suExercise=item[0];
    const text=el('span');text.append(el('strong','',item[1]),el('small','',item[2]));
    b.append(text,el('span','su-arrow','→'));return b;
  }
  function choose(group){
    stop();category=group;setStage('category');root.dataset.simpleMixed='false';hub.replaceChildren();
    const back=button('← Все направления',home,'su-back');back.dataset.suHome='';hub.appendChild(back);
    hub.append(el('h3','su-title',group.title),el('p','su-description',group.description));
    const visibleItems=group.items.slice(0,group.id==='listen'?6:3);
    const list=el('div','su-exercises');visibleItems.forEach(item=>list.appendChild(row(item)));hub.appendChild(list);
    hub.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function taskNav(title){
    nav.replaceChildren();const back=button('← Упражнения',()=>choose(category),'su-back');back.dataset.suBack='';
    nav.append(back,el('span','su-nav-label',title||category.title));
  }
  function start(item){
    stop();routing=true;setStage('task');root.dataset.simpleMixed='false';taskNav(category.title);
    const target=item[3]==='feature'?root.querySelector('[data-af-open="'+item[0]+'"]'):root.querySelector('[data-mode="'+item[0]+'"]');
    if(target)target.click();
    const filters=root.querySelector('#tws-filter-panel');if(filters)filters.open=false;
    routing=false;wrapAudio();nav.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function startMixed(){
    stop();routing=true;setStage('task');root.dataset.simpleMixed='true';taskNav('Короткое занятие');
    const start=root.querySelector('#tws-mix-start');if(start)start.click();
    const filters=root.querySelector('#tws-filter-panel');if(filters)filters.open=false;
    routing=false;nav.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function wrapAudio(){
    const tools=root.querySelector('#tws-audio-tools');
    if(!tools||tools.querySelector('.su-audio-settings'))return;
    const items=[...tools.querySelectorAll('.tw-audio-settings,.tw-audio-patterns,.tw-audio-help')];
    if(!items.length)return;
    const details=el('details','su-audio-settings');details.appendChild(el('summary','','Скорость и повторы'));
    items.forEach(n=>details.appendChild(n));tools.appendChild(details);
  }
  function mount(){
    root=document.getElementById('tw-syllable-lab');shell=root.querySelector('.tw-shell');
    root.dataset.simpleUi='v1';
    hub=el('section','su-hub');hub.setAttribute('aria-label','Выбор занятия');
    nav=el('nav','su-task-nav');nav.setAttribute('aria-label','Навигация по упражнениям');nav.hidden=true;
    const launcher=root.querySelector('.af-launcher');shell.insertBefore(hub,launcher);shell.insertBefore(nav,launcher);
    const footer=root.querySelector('.tw-footer');
    if(footer){
      const info=el('details','su-progress');info.appendChild(el('summary','','Словарь и прогресс'));footer.parentElement.insertBefore(info,footer);info.appendChild(footer);
    }
    root.addEventListener('click',event=>{
      if(routing)return;
      const b=event.target.closest('[data-mode],[data-af-open]');
      if(!b)return;
      const key=b.dataset.mode||b.dataset.afOpen;
      const group=groups.find(g=>g.items.some(item=>item[0]===key));
      if(group){category=group;setStage('task');taskNav(group.title);}
    },true);
    let pending=false;
    new MutationObserver(()=>{
      if(pending)return;pending=true;setTimeout(()=>{pending=false;wrapAudio();},40);
    }).observe(root,{childList:true,subtree:true});
    home();wrapAudio();
  }
  function ready(){const r=document.getElementById('tw-syllable-lab');return r&&r.dataset.audioFeatures==='monlam-practice-v1';}
  if(ready())mount();else{
    const observer=new MutationObserver(()=>{if(ready()){observer.disconnect();mount();}});
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-audio-features']});
    setTimeout(()=>observer.disconnect(),25000);
  }
})();
