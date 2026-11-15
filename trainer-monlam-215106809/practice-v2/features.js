(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TWSLocalRecorder = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  class LocalRecorder {
    constructor(env, changed) {
      this.env = env; this.changed = changed || function () {};
      this.state = 'idle'; this.message = ''; this.url = null;
      this.stream = null; this.recorder = null; this.audio = null;
      this.token = 0; this.seconds = 0; this.timer = null; this.limit = null;
      this.parts = []; this.discard = false;
    }
    supported() {
      return !!(this.env.mediaDevices && this.env.mediaDevices.getUserMedia && this.env.MediaRecorder);
    }
    notify() {
      this.changed({state:this.state,message:this.message,url:this.url,seconds:this.seconds,supported:this.supported()});
    }
    releaseStream(stream) {
      if (stream) stream.getTracks().forEach(function(track) { track.stop(); });
      if (stream === this.stream) this.stream = null;
    }
    clearTimers() {
      this.env.clearInterval(this.timer); this.env.clearTimeout(this.limit);
      this.timer = null; this.limit = null;
    }
    stopPlayback() {
      if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.audio = null; }
      if (this.state === 'playing') {
        this.state = this.url ? 'ready' : 'idle';
        this.message = this.url ? 'Запись готова. Сравните её с образцом Monlam.' : '';
      }
    }
    revoke() {
      if (this.url) this.env.URL.revokeObjectURL(this.url);
      this.url = null;
    }
    clear() {
      this.token++; this.discard = true; this.clearTimers(); this.stopPlayback();
      const rec=this.recorder; this.recorder=null;
      if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch (_) {} }
      this.releaseStream(this.stream); this.revoke(); this.parts=[];
      this.state='idle'; this.seconds=0; this.message=''; this.notify();
    }
    async start() {
      this.clear();
      if (!this.supported()) {
        this.state='error'; this.message='В этом браузере запись недоступна. Попробуйте современный браузер с доступом к микрофону.'; this.notify(); return;
      }
      const token=++this.token;
      this.state='requesting'; this.message='Разрешите доступ к микрофону в окне браузера.'; this.notify();
      try {
        const stream=await this.env.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
        if (token !== this.token) { this.releaseStream(stream); return; }
        this.stream=stream; this.parts=[]; this.discard=false;
        const Recorder=this.env.MediaRecorder;
        const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(function(type) {
          return Recorder.isTypeSupported && Recorder.isTypeSupported(type);
        });
        const rec=new Recorder(stream,mime ? {mimeType:mime} : undefined);
        this.recorder=rec;
        rec.addEventListener('dataavailable',event => {
          if (token === this.token && event.data && event.data.size) this.parts.push(event.data);
        });
        rec.addEventListener('stop',() => {
          this.releaseStream(stream);
          if (token !== this.token || this.discard) return;
          this.clearTimers();
          this.recorder=null;
          const blob=new this.env.Blob(this.parts,{type:rec.mimeType || (this.parts[0] && this.parts[0].type) || 'audio/webm'});
          this.parts=[];
          if (!blob.size) { this.state='error'; this.message='Запись получилась пустой. Проверьте микрофон и повторите.'; }
          else { this.revoke(); this.url=this.env.URL.createObjectURL(blob); this.state='ready'; this.message='Запись готова. Сравните её с образцом Monlam.'; }
          this.notify();
        });
        rec.addEventListener('error',() => {
          if (token !== this.token) return;
          this.clear(); this.state='error'; this.message='Не удалось записать звук. Проверьте микрофон и попробуйте ещё раз.'; this.notify();
        });
        rec.start(250); this.state='recording'; this.seconds=0;
        this.message='Идёт запись. Произнесите фразу и нажмите «Завершить запись».'; this.notify();
        this.timer=this.env.setInterval(() => { this.seconds++; this.notify(); },1000);
        this.limit=this.env.setTimeout(() => this.stop(),45000);
      } catch (error) {
        if (token !== this.token) return;
        this.clearTimers(); this.releaseStream(this.stream); this.state='error';
        this.message=error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
          ? 'Доступ к микрофону закрыт. Разрешите его в настройках сайта в браузере и попробуйте ещё раз.'
          : error && error.name === 'NotFoundError'
          ? 'Микрофон не найден. Подключите его и попробуйте ещё раз.'
          : 'Не удалось включить микрофон. Проверьте подключение и попробуйте ещё раз.';
        this.notify();
      }
    }
    stop() {
      if (this.state === 'requesting') { this.clear(); return; }
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.clearTimers();
        try { this.recorder.stop(); } catch (_) { this.clear(); }
        this.releaseStream(this.stream);
      }
    }
    async listen() {
      if (!this.url || ['recording','requesting'].includes(this.state)) return;
      this.stopPlayback();
      const audio=new this.env.Audio(this.url); this.audio=audio; this.state='playing';
      this.message='Слушаем вашу запись…'; this.notify();
      audio.addEventListener('ended',() => {
        if (this.audio !== audio) return;
        this.stopPlayback(); this.message='Теперь можно включить образец Monlam и сравнить.'; this.notify();
      });
      audio.addEventListener('error',() => {
        if (this.audio !== audio) return;
        this.stopPlayback(); this.message='Не удалось прослушать запись. Запишите себя ещё раз.'; this.notify();
      });
      try { await audio.play(); }
      catch (_) { if(this.audio === audio) { this.stopPlayback(); this.message='Нажмите «Моя запись» ещё раз, чтобы включить звук.'; this.notify(); } }
    }
    dispose() { this.clear(); }
  }
  return LocalRecorder;
});

(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.TWSListenAnswers=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function digits(raw){
    return String(raw || '').trim().replace(/[༠-༩]/g,function(c){return String(c.charCodeAt(0)-0x0F20);});
  }
  function validDate(v){
    const leap=v.year%4===0 && (v.year%100!==0 || v.year%400===0);
    return v.year>=1 && v.year<=9999 && v.month>=1 && v.month<=12 && v.day>=1 &&
      v.day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][v.month-1];
  }
  function parse(kind,raw){
    const s=digits(raw);
    if(kind==='number'){
      let n=s.replace(/[\s\u00A0\u202F_]/g,'');
      if(/^\d{1,3}(,\d{3})+$/.test(n)) n=n.replace(/,/g,'');
      if(!/^\d+$/.test(n))return null;
      const v=Number(n);return Number.isSafeInteger(v) && v<=1000000000?v:null;
    }
    if(kind==='date'){
      let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/),v;
      if(m)v={year:Number(m[1]),month:Number(m[2]),day:Number(m[3])};
      else {
        m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
        if(!m)return null;
        v={year:Number(m[3]),month:Number(m[2]),day:Number(m[1])};
      }
      return validDate(v)?v:null;
    }
    const m=s.match(/^(\d{1,2})[:.](\d{2})$/);
    if(!m)return null;
    const v={hour:Number(m[1]),minute:Number(m[2])};
    return v.hour>=1 && v.hour<=12 && v.minute>=0 && v.minute<=59?v:null;
  }
  function check(kind,raw,expected){
    const value=parse(kind,raw);if(value===null)return {valid:false,correct:false};
    return {valid:true,correct:kind==='number'?value===expected:kind==='date'
      ? value.year===expected.year && value.month===expected.month && value.day===expected.day
      : value.hour===expected.hour && value.minute===expected.minute};
  }
  function clockOptions(value,random){
    random=random||Math.random;
    const start=(value.hour%12)*60+value.minute;
    const choices=[0,60,-60,30].map(function(delta){
      const t=(start+delta+720)%720;
      return {hour:Math.floor(t/60)||12,minute:t%60};
    });
    for(let i=choices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));const tmp=choices[i];choices[i]=choices[j];choices[j]=tmp;}
    return choices;
  }
  return {digits:digits,parse:parse,check:check,validDate:validDate,clockOptions:clockOptions};
});

(function () {
  'use strict';
  if (window.__TWS_AUDIO_FEATURES_V1__) return;
  window.__TWS_AUDIO_FEATURES_V1__=true;
  const DATA={"version":1,"provider":"Monlam","voice":"lhasa_female","lessons":[{"id":"s1","sourceRow":1,"title":"Готовим и думаем","bo":"ང་ཁ་ལག་བཟོ་དུས་བསམ་བློ་མང་པོ་འཁོར་གྱི་འདུག","ru":"Когда я готовлю еду, мне приходит в голову много мыслей.","segments":[{"bo":"ང་","ru":"я"},{"bo":"ཁ་ལག་བཟོ་དུས་","ru":"когда готовлю еду"},{"bo":"བསམ་བློ་མང་པོ་","ru":"много мыслей"},{"bo":"འཁོར་གྱི་འདུག","ru":"приходит в голову"}]},{"id":"s20","sourceRow":20,"title":"Прощаемся до завтра","bo":"ག་ལེར་བཞུགས། སང་ཉིན་མཇལ་ཡོང་།","ru":"До свидания, увидимся завтра!","segments":[{"bo":"ག་ལེར་བཞུགས།","ru":"до свидания; оставайтесь с миром"},{"bo":"སང་ཉིན་","ru":"завтра"},{"bo":"མཇལ་ཡོང་།","ru":"увидимся — вежливое выражение"}]},{"id":"s22","sourceRow":22,"title":"Предприниматели","bo":"ཚོང་པ་ཁ་ཤས་ལ་ཁེ་བཟང་ཞེ་དྲག་ཡོད་རེད།","ru":"Некоторые предприниматели получают большую прибыль.","segments":[{"bo":"ཚོང་པ་ཁ་ཤས་ལ་","ru":"у некоторых предпринимателей"},{"bo":"ཁེ་བཟང་","ru":"прибыль"},{"bo":"ཞེ་དྲག་ཡོད་རེད།","ru":"очень большая"}]},{"id":"s29","sourceRow":29,"title":"Любим цветы","bo":"མི་མང་ཆེ་བ་མེ་ཏོག་ལ་དགའ་པོ་ཞེ་དྲག་ཡོད་རེད།","ru":"Большинство людей очень любят цветы.","segments":[{"bo":"མི་མང་ཆེ་བ་","ru":"большинство людей"},{"bo":"མེ་ཏོག་ལ་","ru":"цветы — то, что любят"},{"bo":"དགའ་པོ་ཞེ་དྲག་ཡོད་རེད།","ru":"очень любят"}]},{"id":"s34","sourceRow":34,"title":"Будущая профессия","bo":"མ་འོངས་པ་ལ་ང་དགེ་རྒན་བྱེད་ཀྱི་ཡིན།","ru":"В будущем я стану учителем.","segments":[{"bo":"མ་འོངས་པ་ལ་","ru":"в будущем"},{"bo":"ང་","ru":"я"},{"bo":"དགེ་རྒན་","ru":"учитель"},{"bo":"བྱེད་ཀྱི་ཡིན།","ru":"стану; буду работать"}]},{"id":"s37","sourceRow":37,"title":"Учим тибетский","bo":"ང་ཚོས་བོད་སྐད་མགྱོགས་པོ་ཤེས་སོང་།","ru":"Мы быстро выучили тибетский язык.","segments":[{"bo":"ང་ཚོས་","ru":"мы"},{"bo":"བོད་སྐད་","ru":"тибетский язык"},{"bo":"མགྱོགས་པོ་","ru":"быстро"},{"bo":"ཤེས་སོང་།","ru":"выучили"}]},{"id":"s38","sourceRow":38,"title":"Слишком солёный суп","bo":"ཐུག་པ་ནང་ལ་ཚྭ་མང་དྲགས་བཞག","ru":"В супе / лапше слишком много соли.","segments":[{"bo":"ཐུག་པ་ནང་ལ་","ru":"в супе с лапшой"},{"bo":"ཚྭ་","ru":"соль"},{"bo":"མང་དྲགས་བཞག","ru":"оказалось слишком много"}]},{"id":"s40","sourceRow":40,"title":"Осторожно на дороге","bo":"ལམ་ཀ་ལ་གཟབ་གཟབ་བྱེད་རོགས་གནང་།","ru":"Пожалуйста, будьте осторожны на дороге.","segments":[{"bo":"ལམ་ཀ་ལ་","ru":"на дороге"},{"bo":"གཟབ་གཟབ་བྱེད་","ru":"быть осторожным"},{"bo":"རོགས་གནང་།","ru":"пожалуйста — вежливая просьба"}]},{"id":"s44","sourceRow":44,"title":"Погода в эти дни","bo":"དེང་སང་གངས་འབབ་ཀྱི་ཡོད་མ་རེད།","ru":"В эти дни снег не идёт.","segments":[{"bo":"དེང་སང་","ru":"в эти дни"},{"bo":"གངས་","ru":"снег"},{"bo":"འབབ་ཀྱི་ཡོད་མ་རེད།","ru":"не идёт"}]},{"id":"s47","sourceRow":47,"title":"Готов ли рис?","bo":"ཨོ། འབྲས་འདི་ཡག་པོ་ཚོས་མི་འདུག","ru":"Ой, этот рис плохо сварен.","segments":[{"bo":"ཨོ།","ru":"ой"},{"bo":"འབྲས་འདི་","ru":"этот рис"},{"bo":"ཡག་པོ་","ru":"хорошо; как следует"},{"bo":"ཚོས་མི་འདུག","ru":"не сварился"}]},{"id":"s58","sourceRow":58,"title":"Вечер и луна","bo":"དགོང་མོ་ཟླ་བ་ཤར་གྱི་རེད།","ru":"Вечером восходит луна.","segments":[{"bo":"དགོང་མོ་","ru":"вечером"},{"bo":"ཟླ་བ་","ru":"луна"},{"bo":"ཤར་གྱི་རེད།","ru":"восходит"}]},{"id":"s66","sourceRow":66,"title":"Едем вместе","bo":"ང་ཚོ་མཉམ་དུ་བོད་ལ་འགྲོ།","ru":"Давайте все вместе поедем в Тибет!","segments":[{"bo":"ང་ཚོ་","ru":"мы"},{"bo":"མཉམ་དུ་","ru":"вместе"},{"bo":"བོད་ལ་","ru":"в Тибет"},{"bo":"འགྲོ།","ru":"поедем; давайте отправимся"}]},{"id":"s71","sourceRow":71,"title":"Читаем книгу","bo":"ང་དེབ་ལྟ་གི་ཡོད།","ru":"Я читаю книгу.","segments":[{"bo":"ང་","ru":"я"},{"bo":"དེབ་","ru":"книгу"},{"bo":"ལྟ་གི་ཡོད།","ru":"читаю"}]},{"id":"s75","sourceRow":75,"title":"Времена года","bo":"ལོ་གཅིག་ལ་ནམ་དུས་བཞི་ཡོད་རེད།","ru":"В году четыре времени года.","segments":[{"bo":"ལོ་གཅིག་ལ་","ru":"в одном году"},{"bo":"ནམ་དུས་བཞི་","ru":"четыре времени года"},{"bo":"ཡོད་རེད།","ru":"есть"}]},{"id":"s87","sourceRow":87,"title":"Хорошие выходные","bo":"ང་གཟའ་མཇུག་ལ་སྐྱིད་པོ་བྱུང་།","ru":"Я хорошо провёл(а) выходные.","segments":[{"bo":"ང་","ru":"я"},{"bo":"གཟའ་མཇུག་ལ་","ru":"на выходных"},{"bo":"སྐྱིད་པོ་བྱུང་།","ru":"хорошо провёл(а) время"}]},{"id":"s98","sourceRow":98,"title":"Что готовит повар","bo":"མ་བྱན་འདིས་ཁ་ལག་འདྲ་མི་འདྲ་བཟོ་གི་ཡོད་རེད།","ru":"Этот повар готовит разные блюда.","segments":[{"bo":"མ་བྱན་འདིས་","ru":"этот повар"},{"bo":"ཁ་ལག་འདྲ་མི་འདྲ་","ru":"разные блюда"},{"bo":"བཟོ་གི་ཡོད་རེད།","ru":"готовит"}]},{"id":"s101","sourceRow":101,"title":"Грецкие орехи","bo":"སྟར་ཁ་དེ་ཚོ་བཅུད་ཆེན་པོ་ཞེ་དྲག་ཡོད་རེད།","ru":"Грецкие орехи очень питательны.","segments":[{"bo":"སྟར་ཁ་དེ་ཚོ་","ru":"эти грецкие орехи"},{"bo":"བཅུད་ཆེན་པོ་","ru":"питательные"},{"bo":"ཞེ་དྲག་ཡོད་རེད།","ru":"очень"}]},{"id":"s112","sourceRow":112,"title":"Сделали приложение","bo":"དེ་རིང་ངས་མཉེན་ཆས་ཞིག་བཟོས་པ་ཡིན།","ru":"Сегодня я сделал(а) приложение.","segments":[{"bo":"དེ་རིང་","ru":"сегодня"},{"bo":"ངས་","ru":"я"},{"bo":"མཉེན་ཆས་ཞིག་","ru":"приложение"},{"bo":"བཟོས་པ་ཡིན།","ru":"сделал(а)"}]},{"id":"s121","sourceRow":121,"title":"Деревья в школе","bo":"ཁོང་ཚོའི་སློབ་གྲྭ་ལ་ཤིང་སྡོང་མང་པོ་མི་འདུག","ru":"В их школе не так много деревьев.","segments":[{"bo":"ཁོང་ཚོའི་སློབ་གྲྭ་ལ་","ru":"в их школе"},{"bo":"ཤིང་སྡོང་མང་པོ་","ru":"много деревьев"},{"bo":"མི་འདུག","ru":"нет"}]},{"id":"s125","sourceRow":125,"title":"Цена соли","bo":"ཚྭ་གོང་ཁེ་བོ་ཞེ་དྲག་རེད།","ru":"Соль стоит очень дёшево.","segments":[{"bo":"ཚྭ་","ru":"соль"},{"bo":"གོང་ཁེ་བོ་ཞེ་དྲག་","ru":"очень дешёвая"},{"bo":"རེད།","ru":"есть; является"}]},{"id":"s133","sourceRow":133,"title":"Гостиницы","bo":"མགྲོན་ཁང་མང་ཆེ་བ་གོང་ཆེན་པོ་རེད།","ru":"Большинство гостиниц дорогие.","segments":[{"bo":"མགྲོན་ཁང་མང་ཆེ་བ་","ru":"большинство гостиниц"},{"bo":"གོང་ཆེན་པོ་","ru":"дорогие"},{"bo":"རེད།","ru":"есть; являются"}]},{"id":"s134","sourceRow":134,"title":"Монастыри в Тибете","bo":"བོད་ལ་དགོན་པ་རྩ་ཆེན་པོ་ཡོད་རེད།","ru":"В Тибете есть священные монастыри.","segments":[{"bo":"བོད་ལ་","ru":"в Тибете"},{"bo":"དགོན་པ་རྩ་ཆེན་པོ་","ru":"священные монастыри"},{"bo":"ཡོད་རེད།","ru":"есть"}]},{"id":"s148","sourceRow":148,"title":"Летняя жара","bo":"དབྱར་ཀ་ཚ་བ་ཆེན་པོ་ཡོད་རེད།","ru":"Летом стоит сильная жара.","segments":[{"bo":"དབྱར་ཀ་","ru":"летом"},{"bo":"ཚ་བ་ཆེན་པོ་","ru":"сильная жара"},{"bo":"ཡོད་རེད།","ru":"стоит; бывает"}]},{"id":"s150","sourceRow":150,"title":"Жара в Дели","bo":"ལྡི་ལི་ལ་ཚ་བ་ཆེན་པོ་ཡོད་རེད།","ru":"В Дели стоит ужасная жара.","segments":[{"bo":"ལྡི་ལི་ལ་","ru":"в Дели"},{"bo":"ཚ་བ་ཆེན་པོ་","ru":"сильная жара"},{"bo":"ཡོད་རེད།","ru":"стоит"}]},{"id":"s153","sourceRow":153,"title":"Животные в школе","bo":"ང་ཚོའི་སློབ་གྲྭ་ལ་དུད་འགྲོ་མང་པོ་མི་འདུག","ru":"В нашей школе не так много животных.","segments":[{"bo":"ང་ཚོའི་སློབ་གྲྭ་ལ་","ru":"в нашей школе"},{"bo":"དུད་འགྲོ་མང་པོ་","ru":"много животных"},{"bo":"མི་འདུག","ru":"нет"}]},{"id":"s163","sourceRow":163,"title":"Где садится солнце","bo":"ཉི་མ་ནུབ་ལ་ནུབ་ཀྱི་རེད།","ru":"Солнце садится на западе.","segments":[{"bo":"ཉི་མ་","ru":"солнце"},{"bo":"ནུབ་ལ་","ru":"на западе"},{"bo":"ནུབ་ཀྱི་རེད།","ru":"садится"}]},{"id":"s165","sourceRow":165,"title":"Запоминаем слова","bo":"ང་ཚོ་ཚིག་གསར་བློ་འཛིན་མང་པོ་བྱེད་ཀྱི་ཡོད།","ru":"Мы запоминаем много слов.","segments":[{"bo":"ང་ཚོ་","ru":"мы"},{"bo":"ཚིག་གསར་","ru":"новые слова"},{"bo":"བློ་འཛིན་མང་པོ་བྱེད་ཀྱི་ཡོད།","ru":"много запоминаем; учим наизусть"}]},{"id":"s166","sourceRow":166,"title":"Друзья за границей","bo":"ངའི་གྲོགས་པོ་གྲོགས་མོ་མང་ཆེ་བ་ཕྱི་རྒྱལ་ལ་ཡོད་རེད།","ru":"Большинство моих друзей находятся за границей.","segments":[{"bo":"ངའི་གྲོགས་པོ་གྲོགས་མོ་མང་ཆེ་བ་","ru":"большинство моих друзей"},{"bo":"ཕྱི་རྒྱལ་ལ་","ru":"за границей"},{"bo":"ཡོད་རེད།","ru":"находятся"}]},{"id":"s174","sourceRow":174,"title":"Знаете ли вы тибетский?","bo":"ཁྱེད་རང་བོད་སྐད་ཤེས་ཀྱི་ཡོད་པས།","ru":"Вы знаете тибетский язык?","segments":[{"bo":"ཁྱེད་རང་","ru":"вы"},{"bo":"བོད་སྐད་","ru":"тибетский язык"},{"bo":"ཤེས་ཀྱི་ཡོད་པས།","ru":"знаете?"}]},{"id":"s180","sourceRow":180,"title":"Снег в Тибете","bo":"བོད་ལ་གངས་མང་པོ་འབབ་ཀྱི་རེད།","ru":"В Тибете выпадает много снега.","segments":[{"bo":"བོད་ལ་","ru":"в Тибете"},{"bo":"གངས་མང་པོ་","ru":"много снега"},{"bo":"འབབ་ཀྱི་རེད།","ru":"выпадает"}]}],"numeric":[{"id":"n0","kind":"number","value":0,"bo":"ཀླད་ཀོར","label":"0"},{"id":"n1","kind":"number","value":1,"bo":"གཅིག","label":"1"},{"id":"n2","kind":"number","value":2,"bo":"གཉིས","label":"2"},{"id":"n3","kind":"number","value":3,"bo":"གསུམ","label":"3"},{"id":"n4","kind":"number","value":4,"bo":"བཞི","label":"4"},{"id":"n5","kind":"number","value":5,"bo":"ལྔ","label":"5"},{"id":"n6","kind":"number","value":6,"bo":"དྲུག","label":"6"},{"id":"n7","kind":"number","value":7,"bo":"བདུན","label":"7"},{"id":"n8","kind":"number","value":8,"bo":"བརྒྱད","label":"8"},{"id":"n9","kind":"number","value":9,"bo":"དགུ","label":"9"},{"id":"n10","kind":"number","value":10,"bo":"བཅུ","label":"10"},{"id":"n11","kind":"number","value":11,"bo":"བཅུ་གཅིག","label":"11"},{"id":"n12","kind":"number","value":12,"bo":"བཅུ་གཉིས","label":"12"},{"id":"n13","kind":"number","value":13,"bo":"བཅུ་གསུམ","label":"13"},{"id":"n14","kind":"number","value":14,"bo":"བཅུ་བཞི","label":"14"},{"id":"n15","kind":"number","value":15,"bo":"བཅོ་ལྔ","label":"15"},{"id":"n16","kind":"number","value":16,"bo":"བཅུ་དྲུག","label":"16"},{"id":"n17","kind":"number","value":17,"bo":"བཅུ་བདུན","label":"17"},{"id":"n18","kind":"number","value":18,"bo":"བཅོ་བརྒྱད","label":"18"},{"id":"n19","kind":"number","value":19,"bo":"བཅུ་དགུ","label":"19"},{"id":"n20","kind":"number","value":20,"bo":"ཉི་ཤུ","label":"20"},{"id":"n21","kind":"number","value":21,"bo":"ཉི་ཤུ་རྩ་གཅིག","label":"21"},{"id":"n22","kind":"number","value":22,"bo":"ཉི་ཤུ་རྩ་གཉིས","label":"22"},{"id":"n23","kind":"number","value":23,"bo":"ཉི་ཤུ་རྩ་གསུམ","label":"23"},{"id":"n24","kind":"number","value":24,"bo":"ཉི་ཤུ་རྩ་བཞི","label":"24"},{"id":"n25","kind":"number","value":25,"bo":"ཉི་ཤུ་རྩ་ལྔ","label":"25"},{"id":"n26","kind":"number","value":26,"bo":"ཉི་ཤུ་རྩ་དྲུག","label":"26"},{"id":"n27","kind":"number","value":27,"bo":"ཉི་ཤུ་རྩ་བདུན","label":"27"},{"id":"n28","kind":"number","value":28,"bo":"ཉི་ཤུ་རྩ་བརྒྱད","label":"28"},{"id":"n29","kind":"number","value":29,"bo":"ཉི་ཤུ་རྩ་དགུ","label":"29"},{"id":"n30","kind":"number","value":30,"bo":"སུམ་ཅུ","label":"30"},{"id":"n31","kind":"number","value":31,"bo":"སུམ་ཅུ་སོ་གཅིག","label":"31"},{"id":"n32","kind":"number","value":32,"bo":"སུམ་ཅུ་སོ་གཉིས","label":"32"},{"id":"n33","kind":"number","value":33,"bo":"སུམ་ཅུ་སོ་གསུམ","label":"33"},{"id":"n34","kind":"number","value":34,"bo":"སུམ་ཅུ་སོ་བཞི","label":"34"},{"id":"n35","kind":"number","value":35,"bo":"སུམ་ཅུ་སོ་ལྔ","label":"35"},{"id":"n36","kind":"number","value":36,"bo":"སུམ་ཅུ་སོ་དྲུག","label":"36"},{"id":"n37","kind":"number","value":37,"bo":"སུམ་ཅུ་སོ་བདུན","label":"37"},{"id":"n38","kind":"number","value":38,"bo":"སུམ་ཅུ་སོ་བརྒྱད","label":"38"},{"id":"n39","kind":"number","value":39,"bo":"སུམ་ཅུ་སོ་དགུ","label":"39"},{"id":"n40","kind":"number","value":40,"bo":"བཞི་བཅུ","label":"40"},{"id":"n41","kind":"number","value":41,"bo":"བཞི་བཅུ་ཞེ་གཅིག","label":"41"},{"id":"n42","kind":"number","value":42,"bo":"བཞི་བཅུ་ཞེ་གཉིས","label":"42"},{"id":"n43","kind":"number","value":43,"bo":"བཞི་བཅུ་ཞེ་གསུམ","label":"43"},{"id":"n44","kind":"number","value":44,"bo":"བཞི་བཅུ་ཞེ་བཞི","label":"44"},{"id":"n45","kind":"number","value":45,"bo":"བཞི་བཅུ་ཞེ་ལྔ","label":"45"},{"id":"n46","kind":"number","value":46,"bo":"བཞི་བཅུ་ཞེ་དྲུག","label":"46"},{"id":"n47","kind":"number","value":47,"bo":"བཞི་བཅུ་ཞེ་བདུན","label":"47"},{"id":"n48","kind":"number","value":48,"bo":"བཞི་བཅུ་ཞེ་བརྒྱད","label":"48"},{"id":"n49","kind":"number","value":49,"bo":"བཞི་བཅུ་ཞེ་དགུ","label":"49"},{"id":"n50","kind":"number","value":50,"bo":"ལྔ་བཅུ","label":"50"},{"id":"n51","kind":"number","value":51,"bo":"ལྔ་བཅུ་ང་གཅིག","label":"51"},{"id":"n52","kind":"number","value":52,"bo":"ལྔ་བཅུ་ང་གཉིས","label":"52"},{"id":"n53","kind":"number","value":53,"bo":"ལྔ་བཅུ་ང་གསུམ","label":"53"},{"id":"n54","kind":"number","value":54,"bo":"ལྔ་བཅུ་ང་བཞི","label":"54"},{"id":"n55","kind":"number","value":55,"bo":"ལྔ་བཅུ་ང་ལྔ","label":"55"},{"id":"n56","kind":"number","value":56,"bo":"ལྔ་བཅུ་ང་དྲུག","label":"56"},{"id":"n57","kind":"number","value":57,"bo":"ལྔ་བཅུ་ང་བདུན","label":"57"},{"id":"n58","kind":"number","value":58,"bo":"ལྔ་བཅུ་ང་བརྒྱད","label":"58"},{"id":"n59","kind":"number","value":59,"bo":"ལྔ་བཅུ་ང་དགུ","label":"59"},{"id":"n60","kind":"number","value":60,"bo":"དྲུག་ཅུ","label":"60"},{"id":"n61","kind":"number","value":61,"bo":"དྲུག་ཅུ་རེ་གཅིག","label":"61"},{"id":"n62","kind":"number","value":62,"bo":"དྲུག་ཅུ་རེ་གཉིས","label":"62"},{"id":"n63","kind":"number","value":63,"bo":"དྲུག་ཅུ་རེ་གསུམ","label":"63"},{"id":"n64","kind":"number","value":64,"bo":"དྲུག་ཅུ་རེ་བཞི","label":"64"},{"id":"n65","kind":"number","value":65,"bo":"དྲུག་ཅུ་རེ་ལྔ","label":"65"},{"id":"n66","kind":"number","value":66,"bo":"དྲུག་ཅུ་རེ་དྲུག","label":"66"},{"id":"n67","kind":"number","value":67,"bo":"དྲུག་ཅུ་རེ་བདུན","label":"67"},{"id":"n68","kind":"number","value":68,"bo":"དྲུག་ཅུ་རེ་བརྒྱད","label":"68"},{"id":"n69","kind":"number","value":69,"bo":"དྲུག་ཅུ་རེ་དགུ","label":"69"},{"id":"n70","kind":"number","value":70,"bo":"བདུན་ཅུ","label":"70"},{"id":"n71","kind":"number","value":71,"bo":"བདུན་ཅུ་དོན་གཅིག","label":"71"},{"id":"n72","kind":"number","value":72,"bo":"བདུན་ཅུ་དོན་གཉིས","label":"72"},{"id":"n73","kind":"number","value":73,"bo":"བདུན་ཅུ་དོན་གསུམ","label":"73"},{"id":"n74","kind":"number","value":74,"bo":"བདུན་ཅུ་དོན་བཞི","label":"74"},{"id":"n75","kind":"number","value":75,"bo":"བདུན་ཅུ་དོན་ལྔ","label":"75"},{"id":"n76","kind":"number","value":76,"bo":"བདུན་ཅུ་དོན་དྲུག","label":"76"},{"id":"n77","kind":"number","value":77,"bo":"བདུན་ཅུ་དོན་བདུན","label":"77"},{"id":"n78","kind":"number","value":78,"bo":"བདུན་ཅུ་དོན་བརྒྱད","label":"78"},{"id":"n79","kind":"number","value":79,"bo":"བདུན་ཅུ་དོན་དགུ","label":"79"},{"id":"n80","kind":"number","value":80,"bo":"བརྒྱད་ཅུ","label":"80"},{"id":"n81","kind":"number","value":81,"bo":"བརྒྱད་ཅུ་གྱ་གཅིག","label":"81"},{"id":"n82","kind":"number","value":82,"bo":"བརྒྱད་ཅུ་གྱ་གཉིས","label":"82"},{"id":"n83","kind":"number","value":83,"bo":"བརྒྱད་ཅུ་གྱ་གསུམ","label":"83"},{"id":"n84","kind":"number","value":84,"bo":"བརྒྱད་ཅུ་གྱ་བཞི","label":"84"},{"id":"n85","kind":"number","value":85,"bo":"བརྒྱད་ཅུ་གྱ་ལྔ","label":"85"},{"id":"n86","kind":"number","value":86,"bo":"བརྒྱད་ཅུ་གྱ་དྲུག","label":"86"},{"id":"n87","kind":"number","value":87,"bo":"བརྒྱད་ཅུ་གྱ་བདུན","label":"87"},{"id":"n88","kind":"number","value":88,"bo":"བརྒྱད་ཅུ་གྱ་བརྒྱད","label":"88"},{"id":"n89","kind":"number","value":89,"bo":"བརྒྱད་ཅུ་གྱ་དགུ","label":"89"},{"id":"n90","kind":"number","value":90,"bo":"དགུ་བཅུ","label":"90"},{"id":"n91","kind":"number","value":91,"bo":"དགུ་བཅུ་གོ་གཅིག","label":"91"},{"id":"n92","kind":"number","value":92,"bo":"དགུ་བཅུ་གོ་གཉིས","label":"92"},{"id":"n93","kind":"number","value":93,"bo":"དགུ་བཅུ་གོ་གསུམ","label":"93"},{"id":"n94","kind":"number","value":94,"bo":"དགུ་བཅུ་གོ་བཞི","label":"94"},{"id":"n95","kind":"number","value":95,"bo":"དགུ་བཅུ་གོ་ལྔ","label":"95"},{"id":"n96","kind":"number","value":96,"bo":"དགུ་བཅུ་གོ་དྲུག","label":"96"},{"id":"n97","kind":"number","value":97,"bo":"དགུ་བཅུ་གོ་བདུན","label":"97"},{"id":"n98","kind":"number","value":98,"bo":"དགུ་བཅུ་གོ་བརྒྱད","label":"98"},{"id":"n99","kind":"number","value":99,"bo":"དགུ་བཅུ་གོ་དགུ","label":"99"},{"id":"n100","kind":"number","value":100,"bo":"བརྒྱ","label":"100"},{"id":"n101","kind":"number","value":101,"bo":"བརྒྱ་དང་གཅིག","label":"101"},{"id":"n105","kind":"number","value":105,"bo":"བརྒྱ་དང་ལྔ","label":"105"},{"id":"n110","kind":"number","value":110,"bo":"བརྒྱ་དང་བཅུ","label":"110"},{"id":"n111","kind":"number","value":111,"bo":"བརྒྱ་དང་བཅུ་གཅིག","label":"111"},{"id":"n120","kind":"number","value":120,"bo":"བརྒྱ་དང་ཉི་ཤུ","label":"120"},{"id":"n121","kind":"number","value":121,"bo":"བརྒྱ་དང་ཉི་ཤུ་རྩ་གཅིག","label":"121"},{"id":"n150","kind":"number","value":150,"bo":"བརྒྱ་དང་ལྔ་བཅུ","label":"150"},{"id":"n199","kind":"number","value":199,"bo":"བརྒྱ་དང་དགུ་བཅུ་གོ་དགུ","label":"199"},{"id":"n200","kind":"number","value":200,"bo":"ཉིས་བརྒྱ","label":"200"},{"id":"n201","kind":"number","value":201,"bo":"ཉིས་བརྒྱ་དང་གཅིག","label":"201"},{"id":"n250","kind":"number","value":250,"bo":"ཉིས་བརྒྱ་དང་ལྔ་བཅུ","label":"250"},{"id":"n300","kind":"number","value":300,"bo":"སུམ་བརྒྱ","label":"300"},{"id":"n333","kind":"number","value":333,"bo":"སུམ་བརྒྱ་དང་སུམ་ཅུ་སོ་གསུམ","label":"333"},{"id":"n500","kind":"number","value":500,"bo":"ལྔ་བརྒྱ","label":"500"},{"id":"n750","kind":"number","value":750,"bo":"བདུན་བརྒྱ་དང་ལྔ་བཅུ","label":"750"},{"id":"n999","kind":"number","value":999,"bo":"དགུ་བརྒྱ་དང་དགུ་བཅུ་གོ་དགུ","label":"999"},{"id":"n1000","kind":"number","value":1000,"bo":"ཆིག་སྟོང","label":"1 000"},{"id":"n1001","kind":"number","value":1001,"bo":"ཆིག་སྟོང་དང་གཅིག","label":"1 001"},{"id":"n1010","kind":"number","value":1010,"bo":"ཆིག་སྟོང་དང་བཅུ","label":"1 010"},{"id":"n1100","kind":"number","value":1100,"bo":"ཆིག་སྟོང་དང་བརྒྱ","label":"1 100"},{"id":"n1250","kind":"number","value":1250,"bo":"ཆིག་སྟོང་དང་ཉིས་བརྒྱ་དང་ལྔ་བཅུ","label":"1 250"},{"id":"n1500","kind":"number","value":1500,"bo":"ཆིག་སྟོང་དང་ལྔ་བརྒྱ","label":"1 500"},{"id":"n2000","kind":"number","value":2000,"bo":"ཉིས་སྟོང","label":"2 000"},{"id":"n2026","kind":"number","value":2026,"bo":"ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག","label":"2 026"},{"id":"n5000","kind":"number","value":5000,"bo":"ལྔ་སྟོང","label":"5 000"},{"id":"n10000","kind":"number","value":10000,"bo":"ཆིག་ཁྲི","label":"10 000"},{"id":"n100000","kind":"number","value":100000,"bo":"ཆིག་འབུམ","label":"100 000"},{"id":"n1000000","kind":"number","value":1000000,"bo":"ས་ཡ་གཅིག","label":"1 000 000"},{"id":"n100000000","kind":"number","value":100000000,"bo":"དུང་ཕྱུར་གཅིག","label":"100 000 000"},{"id":"n1000000000","kind":"number","value":1000000000,"bo":"དུང་ཕྱུར་བཅུ","label":"1 000 000 000"},{"id":"d2025-01-01","kind":"date","value":{"year":2025,"month":1,"day":1},"iso":"2025-01-01","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་དང་པོའི་ཚེས་པ་གཅིག","label":"01.01.2025"},{"id":"d2026-01-15","kind":"date","value":{"year":2026,"month":1,"day":15},"iso":"2026-01-15","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་དང་པོའི་ཚེས་པ་བཅོ་ལྔ","label":"15.01.2026"},{"id":"d2027-01-28","kind":"date","value":{"year":2027,"month":1,"day":28},"iso":"2027-01-28","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་དང་པོའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད","label":"28.01.2027"},{"id":"d2026-02-01","kind":"date","value":{"year":2026,"month":2,"day":1},"iso":"2026-02-01","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་གཉིས་པའི་ཚེས་པ་གཅིག","label":"01.02.2026"},{"id":"d2027-02-15","kind":"date","value":{"year":2027,"month":2,"day":15},"iso":"2027-02-15","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་གཉིས་པའི་ཚེས་པ་བཅོ་ལྔ","label":"15.02.2027"},{"id":"d2024-02-29","kind":"date","value":{"year":2024,"month":2,"day":29},"iso":"2024-02-29","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་གཉིས་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་དགུ","label":"29.02.2024"},{"id":"d2027-03-01","kind":"date","value":{"year":2027,"month":3,"day":1},"iso":"2027-03-01","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་གསུམ་པའི་ཚེས་པ་གཅིག","label":"01.03.2027"},{"id":"d2024-03-15","kind":"date","value":{"year":2024,"month":3,"day":15},"iso":"2024-03-15","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་གསུམ་པའི་ཚེས་པ་བཅོ་ལྔ","label":"15.03.2024"},{"id":"d2025-03-28","kind":"date","value":{"year":2025,"month":3,"day":28},"iso":"2025-03-28","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་གསུམ་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད","label":"28.03.2025"},{"id":"d2024-04-01","kind":"date","value":{"year":2024,"month":4,"day":1},"iso":"2024-04-01","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་བཞི་པའི་ཚེས་པ་གཅིག","label":"01.04.2024"},{"id":"d2025-04-15","kind":"date","value":{"year":2025,"month":4,"day":15},"iso":"2025-04-15","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་བཞི་པའི་ཚེས་པ་བཅོ་ལྔ","label":"15.04.2025"},{"id":"d2026-04-28","kind":"date","value":{"year":2026,"month":4,"day":28},"iso":"2026-04-28","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་བཞི་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད","label":"28.04.2026"},{"id":"d2025-05-01","kind":"date","value":{"year":2025,"month":5,"day":1},"iso":"2025-05-01","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་ལྔ་པའི་ཚེས་པ་གཅིག","label":"01.05.2025"},{"id":"d2026-05-15","kind":"date","value":{"year":2026,"month":5,"day":15},"iso":"2026-05-15","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་ལྔ་པའི་ཚེས་པ་བཅོ་ལྔ","label":"15.05.2026"},{"id":"d2027-05-28","kind":"date","value":{"year":2027,"month":5,"day":28},"iso":"2027-05-28","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་ལྔ་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད","label":"28.05.2027"},{"id":"d2026-06-01","kind":"date","value":{"year":2026,"month":6,"day":1},"iso":"2026-06-01","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་དྲུག་པའི་ཚེས་པ་གཅིག","label":"01.06.2026"},{"id":"d2027-06-15","kind":"date","value":{"year":2027,"month":6,"day":15},"iso":"2027-06-15","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་དྲུག་པའི་ཚེས་པ་བཅོ་ལྔ","label":"15.06.2027"},{"id":"d2024-06-28","kind":"date","value":{"year":2024,"month":6,"day":28},"iso":"2024-06-28","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་དྲུག་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད","label":"28.06.2024"},{"id":"d2027-07-01","kind":"date","value":{"year":2027,"month":7,"day":1},"iso":"2027-07-01","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་བདུན་པའི་ཚེས་པ་གཅིག","label":"01.07.2027"},{"id":"d2024-07-15","kind":"date","value":{"year":2024,"month":7,"day":15},"iso":"2024-07-15","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་བདུན་པའི་ཚེས་པ་བཅོ་ལྔ","label":"15.07.2024"},{"id":"d2025-07-28","kind":"date","value":{"year":2025,"month":7,"day":28},"iso":"2025-07-28","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་བདུན་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད","label":"28.07.2025"},{"id":"d2024-08-01","kind":"date","value":{"year":2024,"month":8,"day":1},"iso":"2024-08-01","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་བརྒྱད་པའི་ཚེས་པ་གཅིག","label":"01.08.2024"},{"id":"d2025-08-15","kind":"date","value":{"year":2025,"month":8,"day":15},"iso":"2025-08-15","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་བརྒྱད་པའི་ཚེས་པ་བཅོ་ལྔ","label":"15.08.2025"},{"id":"d2026-08-28","kind":"date","value":{"year":2026,"month":8,"day":28},"iso":"2026-08-28","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་བརྒྱད་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད","label":"28.08.2026"},{"id":"d2025-09-01","kind":"date","value":{"year":2025,"month":9,"day":1},"iso":"2025-09-01","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་དགུ་པའི་ཚེས་པ་གཅིག","label":"01.09.2025"},{"id":"d2026-09-15","kind":"date","value":{"year":2026,"month":9,"day":15},"iso":"2026-09-15","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་དགུ་པའི་ཚེས་པ་བཅོ་ལྔ","label":"15.09.2026"},{"id":"d2027-09-28","kind":"date","value":{"year":2027,"month":9,"day":28},"iso":"2027-09-28","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་དགུ་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད","label":"28.09.2027"},{"id":"d2026-10-01","kind":"date","value":{"year":2026,"month":10,"day":1},"iso":"2026-10-01","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་བཅུ་པའི་ཚེས་པ་གཅིག","label":"01.10.2026"},{"id":"d2027-10-15","kind":"date","value":{"year":2027,"month":10,"day":15},"iso":"2027-10-15","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་བཅུ་པའི་ཚེས་པ་བཅོ་ལྔ","label":"15.10.2027"},{"id":"d2024-10-28","kind":"date","value":{"year":2024,"month":10,"day":28},"iso":"2024-10-28","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་བཅུ་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད","label":"28.10.2024"},{"id":"d2027-11-01","kind":"date","value":{"year":2027,"month":11,"day":1},"iso":"2027-11-01","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་བཅུ་གཅིག་པའི་ཚེས་པ་གཅིག","label":"01.11.2027"},{"id":"d2024-11-15","kind":"date","value":{"year":2024,"month":11,"day":15},"iso":"2024-11-15","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་བཅུ་གཅིག་པའི་ཚེས་པ་བཅོ་ལྔ","label":"15.11.2024"},{"id":"d2025-11-28","kind":"date","value":{"year":2025,"month":11,"day":28},"iso":"2025-11-28","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་བཅུ་གཅིག་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད","label":"28.11.2025"},{"id":"d2024-12-01","kind":"date","value":{"year":2024,"month":12,"day":1},"iso":"2024-12-01","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་བཅུ་གཉིས་པའི་ཚེས་པ་གཅིག","label":"01.12.2024"},{"id":"d2025-12-15","kind":"date","value":{"year":2025,"month":12,"day":15},"iso":"2025-12-15","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་བཅུ་གཉིས་པའི་ཚེས་པ་བཅོ་ལྔ","label":"15.12.2025"},{"id":"d2026-12-28","kind":"date","value":{"year":2026,"month":12,"day":28},"iso":"2026-12-28","bo":"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་བཅུ་གཉིས་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད","label":"28.12.2026"},{"id":"t1-0","kind":"time","style":"direct","value":{"hour":1,"minute":0},"bo":"ཆུ་ཚོད་དང་པོ","label":"1:00"},{"id":"t1-5","kind":"time","style":"direct","value":{"hour":1,"minute":5},"bo":"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་ལྔ","label":"1:05"},{"id":"t1-10","kind":"time","style":"direct","value":{"hour":1,"minute":10},"bo":"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་བཅུ","label":"1:10"},{"id":"t1-15","kind":"time","style":"direct","value":{"hour":1,"minute":15},"bo":"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་བཅོ་ལྔ","label":"1:15"},{"id":"r1-15","kind":"time","style":"relative","value":{"hour":1,"minute":15},"bo":"ཆུ་ཚོད་དང་པོ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ","label":"1:15"},{"id":"t1-20","kind":"time","style":"direct","value":{"hour":1,"minute":20},"bo":"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་ཉི་ཤུ","label":"1:20"},{"id":"t1-25","kind":"time","style":"direct","value":{"hour":1,"minute":25},"bo":"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ","label":"1:25"},{"id":"t1-30","kind":"time","style":"direct","value":{"hour":1,"minute":30},"bo":"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་སུམ་ཅུ","label":"1:30"},{"id":"r1-30","kind":"time","style":"relative","value":{"hour":1,"minute":30},"bo":"ཆུ་ཚོད་གཅིག་དང་ཕྱེད་ཀ","label":"1:30"},{"id":"t1-35","kind":"time","style":"direct","value":{"hour":1,"minute":35},"bo":"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ","label":"1:35"},{"id":"t1-40","kind":"time","style":"direct","value":{"hour":1,"minute":40},"bo":"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་བཞི་བཅུ","label":"1:40"},{"id":"t1-45","kind":"time","style":"direct","value":{"hour":1,"minute":45},"bo":"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ","label":"1:45"},{"id":"r1-45","kind":"time","style":"relative","value":{"hour":1,"minute":45},"bo":"ཆུ་ཚོད་གཉིས་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ","label":"1:45"},{"id":"t1-50","kind":"time","style":"direct","value":{"hour":1,"minute":50},"bo":"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་ལྔ་བཅུ","label":"1:50"},{"id":"t1-55","kind":"time","style":"direct","value":{"hour":1,"minute":55},"bo":"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ","label":"1:55"},{"id":"t2-0","kind":"time","style":"direct","value":{"hour":2,"minute":0},"bo":"ཆུ་ཚོད་གཉིས་པ","label":"2:00"},{"id":"t2-5","kind":"time","style":"direct","value":{"hour":2,"minute":5},"bo":"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་ལྔ","label":"2:05"},{"id":"t2-10","kind":"time","style":"direct","value":{"hour":2,"minute":10},"bo":"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་བཅུ","label":"2:10"},{"id":"t2-15","kind":"time","style":"direct","value":{"hour":2,"minute":15},"bo":"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་བཅོ་ལྔ","label":"2:15"},{"id":"r2-15","kind":"time","style":"relative","value":{"hour":2,"minute":15},"bo":"ཆུ་ཚོད་གཉིས་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ","label":"2:15"},{"id":"t2-20","kind":"time","style":"direct","value":{"hour":2,"minute":20},"bo":"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་ཉི་ཤུ","label":"2:20"},{"id":"t2-25","kind":"time","style":"direct","value":{"hour":2,"minute":25},"bo":"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ","label":"2:25"},{"id":"t2-30","kind":"time","style":"direct","value":{"hour":2,"minute":30},"bo":"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་སུམ་ཅུ","label":"2:30"},{"id":"r2-30","kind":"time","style":"relative","value":{"hour":2,"minute":30},"bo":"ཆུ་ཚོད་གཉིས་དང་ཕྱེད་ཀ","label":"2:30"},{"id":"t2-35","kind":"time","style":"direct","value":{"hour":2,"minute":35},"bo":"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ","label":"2:35"},{"id":"t2-40","kind":"time","style":"direct","value":{"hour":2,"minute":40},"bo":"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་བཞི་བཅུ","label":"2:40"},{"id":"t2-45","kind":"time","style":"direct","value":{"hour":2,"minute":45},"bo":"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ","label":"2:45"},{"id":"r2-45","kind":"time","style":"relative","value":{"hour":2,"minute":45},"bo":"ཆུ་ཚོད་གསུམ་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ","label":"2:45"},{"id":"t2-50","kind":"time","style":"direct","value":{"hour":2,"minute":50},"bo":"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་ལྔ་བཅུ","label":"2:50"},{"id":"t2-55","kind":"time","style":"direct","value":{"hour":2,"minute":55},"bo":"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ","label":"2:55"},{"id":"t3-0","kind":"time","style":"direct","value":{"hour":3,"minute":0},"bo":"ཆུ་ཚོད་གསུམ་པ","label":"3:00"},{"id":"t3-5","kind":"time","style":"direct","value":{"hour":3,"minute":5},"bo":"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་ལྔ","label":"3:05"},{"id":"t3-10","kind":"time","style":"direct","value":{"hour":3,"minute":10},"bo":"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་བཅུ","label":"3:10"},{"id":"t3-15","kind":"time","style":"direct","value":{"hour":3,"minute":15},"bo":"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་བཅོ་ལྔ","label":"3:15"},{"id":"r3-15","kind":"time","style":"relative","value":{"hour":3,"minute":15},"bo":"ཆུ་ཚོད་གསུམ་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ","label":"3:15"},{"id":"t3-20","kind":"time","style":"direct","value":{"hour":3,"minute":20},"bo":"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་ཉི་ཤུ","label":"3:20"},{"id":"t3-25","kind":"time","style":"direct","value":{"hour":3,"minute":25},"bo":"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ","label":"3:25"},{"id":"t3-30","kind":"time","style":"direct","value":{"hour":3,"minute":30},"bo":"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་སུམ་ཅུ","label":"3:30"},{"id":"r3-30","kind":"time","style":"relative","value":{"hour":3,"minute":30},"bo":"ཆུ་ཚོད་གསུམ་དང་ཕྱེད་ཀ","label":"3:30"},{"id":"t3-35","kind":"time","style":"direct","value":{"hour":3,"minute":35},"bo":"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ","label":"3:35"},{"id":"t3-40","kind":"time","style":"direct","value":{"hour":3,"minute":40},"bo":"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་བཞི་བཅུ","label":"3:40"},{"id":"t3-45","kind":"time","style":"direct","value":{"hour":3,"minute":45},"bo":"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ","label":"3:45"},{"id":"r3-45","kind":"time","style":"relative","value":{"hour":3,"minute":45},"bo":"ཆུ་ཚོད་བཞི་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ","label":"3:45"},{"id":"t3-50","kind":"time","style":"direct","value":{"hour":3,"minute":50},"bo":"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་ལྔ་བཅུ","label":"3:50"},{"id":"t3-55","kind":"time","style":"direct","value":{"hour":3,"minute":55},"bo":"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ","label":"3:55"},{"id":"t4-0","kind":"time","style":"direct","value":{"hour":4,"minute":0},"bo":"ཆུ་ཚོད་བཞི་པ","label":"4:00"},{"id":"t4-5","kind":"time","style":"direct","value":{"hour":4,"minute":5},"bo":"ཆུ་ཚོད་བཞི་དང་སྐར་མ་ལྔ","label":"4:05"},{"id":"t4-10","kind":"time","style":"direct","value":{"hour":4,"minute":10},"bo":"ཆུ་ཚོད་བཞི་དང་སྐར་མ་བཅུ","label":"4:10"},{"id":"t4-15","kind":"time","style":"direct","value":{"hour":4,"minute":15},"bo":"ཆུ་ཚོད་བཞི་དང་སྐར་མ་བཅོ་ལྔ","label":"4:15"},{"id":"r4-15","kind":"time","style":"relative","value":{"hour":4,"minute":15},"bo":"ཆུ་ཚོད་བཞི་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ","label":"4:15"},{"id":"t4-20","kind":"time","style":"direct","value":{"hour":4,"minute":20},"bo":"ཆུ་ཚོད་བཞི་དང་སྐར་མ་ཉི་ཤུ","label":"4:20"},{"id":"t4-25","kind":"time","style":"direct","value":{"hour":4,"minute":25},"bo":"ཆུ་ཚོད་བཞི་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ","label":"4:25"},{"id":"t4-30","kind":"time","style":"direct","value":{"hour":4,"minute":30},"bo":"ཆུ་ཚོད་བཞི་དང་སྐར་མ་སུམ་ཅུ","label":"4:30"},{"id":"r4-30","kind":"time","style":"relative","value":{"hour":4,"minute":30},"bo":"ཆུ་ཚོད་བཞི་དང་ཕྱེད་ཀ","label":"4:30"},{"id":"t4-35","kind":"time","style":"direct","value":{"hour":4,"minute":35},"bo":"ཆུ་ཚོད་བཞི་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ","label":"4:35"},{"id":"t4-40","kind":"time","style":"direct","value":{"hour":4,"minute":40},"bo":"ཆུ་ཚོད་བཞི་དང་སྐར་མ་བཞི་བཅུ","label":"4:40"},{"id":"t4-45","kind":"time","style":"direct","value":{"hour":4,"minute":45},"bo":"ཆུ་ཚོད་བཞི་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ","label":"4:45"},{"id":"r4-45","kind":"time","style":"relative","value":{"hour":4,"minute":45},"bo":"ཆུ་ཚོད་ལྔ་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ","label":"4:45"},{"id":"t4-50","kind":"time","style":"direct","value":{"hour":4,"minute":50},"bo":"ཆུ་ཚོད་བཞི་དང་སྐར་མ་ལྔ་བཅུ","label":"4:50"},{"id":"t4-55","kind":"time","style":"direct","value":{"hour":4,"minute":55},"bo":"ཆུ་ཚོད་བཞི་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ","label":"4:55"},{"id":"t5-0","kind":"time","style":"direct","value":{"hour":5,"minute":0},"bo":"ཆུ་ཚོད་ལྔ་པ","label":"5:00"},{"id":"t5-5","kind":"time","style":"direct","value":{"hour":5,"minute":5},"bo":"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་ལྔ","label":"5:05"},{"id":"t5-10","kind":"time","style":"direct","value":{"hour":5,"minute":10},"bo":"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་བཅུ","label":"5:10"},{"id":"t5-15","kind":"time","style":"direct","value":{"hour":5,"minute":15},"bo":"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་བཅོ་ལྔ","label":"5:15"},{"id":"r5-15","kind":"time","style":"relative","value":{"hour":5,"minute":15},"bo":"ཆུ་ཚོད་ལྔ་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ","label":"5:15"},{"id":"t5-20","kind":"time","style":"direct","value":{"hour":5,"minute":20},"bo":"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་ཉི་ཤུ","label":"5:20"},{"id":"t5-25","kind":"time","style":"direct","value":{"hour":5,"minute":25},"bo":"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ","label":"5:25"},{"id":"t5-30","kind":"time","style":"direct","value":{"hour":5,"minute":30},"bo":"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་སུམ་ཅུ","label":"5:30"},{"id":"r5-30","kind":"time","style":"relative","value":{"hour":5,"minute":30},"bo":"ཆུ་ཚོད་ལྔ་དང་ཕྱེད་ཀ","label":"5:30"},{"id":"t5-35","kind":"time","style":"direct","value":{"hour":5,"minute":35},"bo":"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ","label":"5:35"},{"id":"t5-40","kind":"time","style":"direct","value":{"hour":5,"minute":40},"bo":"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་བཞི་བཅུ","label":"5:40"},{"id":"t5-45","kind":"time","style":"direct","value":{"hour":5,"minute":45},"bo":"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ","label":"5:45"},{"id":"r5-45","kind":"time","style":"relative","value":{"hour":5,"minute":45},"bo":"ཆུ་ཚོད་དྲུག་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ","label":"5:45"},{"id":"t5-50","kind":"time","style":"direct","value":{"hour":5,"minute":50},"bo":"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་ལྔ་བཅུ","label":"5:50"},{"id":"t5-55","kind":"time","style":"direct","value":{"hour":5,"minute":55},"bo":"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ","label":"5:55"},{"id":"t6-0","kind":"time","style":"direct","value":{"hour":6,"minute":0},"bo":"ཆུ་ཚོད་དྲུག་པ","label":"6:00"},{"id":"t6-5","kind":"time","style":"direct","value":{"hour":6,"minute":5},"bo":"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་ལྔ","label":"6:05"},{"id":"t6-10","kind":"time","style":"direct","value":{"hour":6,"minute":10},"bo":"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་བཅུ","label":"6:10"},{"id":"t6-15","kind":"time","style":"direct","value":{"hour":6,"minute":15},"bo":"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་བཅོ་ལྔ","label":"6:15"},{"id":"r6-15","kind":"time","style":"relative","value":{"hour":6,"minute":15},"bo":"ཆུ་ཚོད་དྲུག་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ","label":"6:15"},{"id":"t6-20","kind":"time","style":"direct","value":{"hour":6,"minute":20},"bo":"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་ཉི་ཤུ","label":"6:20"},{"id":"t6-25","kind":"time","style":"direct","value":{"hour":6,"minute":25},"bo":"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ","label":"6:25"},{"id":"t6-30","kind":"time","style":"direct","value":{"hour":6,"minute":30},"bo":"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་སུམ་ཅུ","label":"6:30"},{"id":"r6-30","kind":"time","style":"relative","value":{"hour":6,"minute":30},"bo":"ཆུ་ཚོད་དྲུག་དང་ཕྱེད་ཀ","label":"6:30"},{"id":"t6-35","kind":"time","style":"direct","value":{"hour":6,"minute":35},"bo":"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ","label":"6:35"},{"id":"t6-40","kind":"time","style":"direct","value":{"hour":6,"minute":40},"bo":"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་བཞི་བཅུ","label":"6:40"},{"id":"t6-45","kind":"time","style":"direct","value":{"hour":6,"minute":45},"bo":"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ","label":"6:45"},{"id":"r6-45","kind":"time","style":"relative","value":{"hour":6,"minute":45},"bo":"ཆུ་ཚོད་བདུན་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ","label":"6:45"},{"id":"t6-50","kind":"time","style":"direct","value":{"hour":6,"minute":50},"bo":"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་ལྔ་བཅུ","label":"6:50"},{"id":"t6-55","kind":"time","style":"direct","value":{"hour":6,"minute":55},"bo":"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ","label":"6:55"},{"id":"t7-0","kind":"time","style":"direct","value":{"hour":7,"minute":0},"bo":"ཆུ་ཚོད་བདུན་པ","label":"7:00"},{"id":"t7-5","kind":"time","style":"direct","value":{"hour":7,"minute":5},"bo":"ཆུ་ཚོད་བདུན་དང་སྐར་མ་ལྔ","label":"7:05"},{"id":"t7-10","kind":"time","style":"direct","value":{"hour":7,"minute":10},"bo":"ཆུ་ཚོད་བདུན་དང་སྐར་མ་བཅུ","label":"7:10"},{"id":"t7-15","kind":"time","style":"direct","value":{"hour":7,"minute":15},"bo":"ཆུ་ཚོད་བདུན་དང་སྐར་མ་བཅོ་ལྔ","label":"7:15"},{"id":"r7-15","kind":"time","style":"relative","value":{"hour":7,"minute":15},"bo":"ཆུ་ཚོད་བདུན་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ","label":"7:15"},{"id":"t7-20","kind":"time","style":"direct","value":{"hour":7,"minute":20},"bo":"ཆུ་ཚོད་བདུན་དང་སྐར་མ་ཉི་ཤུ","label":"7:20"},{"id":"t7-25","kind":"time","style":"direct","value":{"hour":7,"minute":25},"bo":"ཆུ་ཚོད་བདུན་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ","label":"7:25"},{"id":"t7-30","kind":"time","style":"direct","value":{"hour":7,"minute":30},"bo":"ཆུ་ཚོད་བདུན་དང་སྐར་མ་སུམ་ཅུ","label":"7:30"},{"id":"r7-30","kind":"time","style":"relative","value":{"hour":7,"minute":30},"bo":"ཆུ་ཚོད་བདུན་དང་ཕྱེད་ཀ","label":"7:30"},{"id":"t7-35","kind":"time","style":"direct","value":{"hour":7,"minute":35},"bo":"ཆུ་ཚོད་བདུན་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ","label":"7:35"},{"id":"t7-40","kind":"time","style":"direct","value":{"hour":7,"minute":40},"bo":"ཆུ་ཚོད་བདུན་དང་སྐར་མ་བཞི་བཅུ","label":"7:40"},{"id":"t7-45","kind":"time","style":"direct","value":{"hour":7,"minute":45},"bo":"ཆུ་ཚོད་བདུན་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ","label":"7:45"},{"id":"r7-45","kind":"time","style":"relative","value":{"hour":7,"minute":45},"bo":"ཆུ་ཚོད་བརྒྱད་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ","label":"7:45"},{"id":"t7-50","kind":"time","style":"direct","value":{"hour":7,"minute":50},"bo":"ཆུ་ཚོད་བདུན་དང་སྐར་མ་ལྔ་བཅུ","label":"7:50"},{"id":"t7-55","kind":"time","style":"direct","value":{"hour":7,"minute":55},"bo":"ཆུ་ཚོད་བདུན་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ","label":"7:55"},{"id":"t8-0","kind":"time","style":"direct","value":{"hour":8,"minute":0},"bo":"ཆུ་ཚོད་བརྒྱད་པ","label":"8:00"},{"id":"t8-5","kind":"time","style":"direct","value":{"hour":8,"minute":5},"bo":"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་ལྔ","label":"8:05"},{"id":"t8-10","kind":"time","style":"direct","value":{"hour":8,"minute":10},"bo":"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་བཅུ","label":"8:10"},{"id":"t8-15","kind":"time","style":"direct","value":{"hour":8,"minute":15},"bo":"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་བཅོ་ལྔ","label":"8:15"},{"id":"r8-15","kind":"time","style":"relative","value":{"hour":8,"minute":15},"bo":"ཆུ་ཚོད་བརྒྱད་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ","label":"8:15"},{"id":"t8-20","kind":"time","style":"direct","value":{"hour":8,"minute":20},"bo":"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་ཉི་ཤུ","label":"8:20"},{"id":"t8-25","kind":"time","style":"direct","value":{"hour":8,"minute":25},"bo":"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ","label":"8:25"},{"id":"t8-30","kind":"time","style":"direct","value":{"hour":8,"minute":30},"bo":"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་སུམ་ཅུ","label":"8:30"},{"id":"r8-30","kind":"time","style":"relative","value":{"hour":8,"minute":30},"bo":"ཆུ་ཚོད་བརྒྱད་དང་ཕྱེད་ཀ","label":"8:30"},{"id":"t8-35","kind":"time","style":"direct","value":{"hour":8,"minute":35},"bo":"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ","label":"8:35"},{"id":"t8-40","kind":"time","style":"direct","value":{"hour":8,"minute":40},"bo":"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་བཞི་བཅུ","label":"8:40"},{"id":"t8-45","kind":"time","style":"direct","value":{"hour":8,"minute":45},"bo":"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ","label":"8:45"},{"id":"r8-45","kind":"time","style":"relative","value":{"hour":8,"minute":45},"bo":"ཆུ་ཚོད་དགུ་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ","label":"8:45"},{"id":"t8-50","kind":"time","style":"direct","value":{"hour":8,"minute":50},"bo":"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་ལྔ་བཅུ","label":"8:50"},{"id":"t8-55","kind":"time","style":"direct","value":{"hour":8,"minute":55},"bo":"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ","label":"8:55"},{"id":"t9-0","kind":"time","style":"direct","value":{"hour":9,"minute":0},"bo":"ཆུ་ཚོད་དགུ་པ","label":"9:00"},{"id":"t9-5","kind":"time","style":"direct","value":{"hour":9,"minute":5},"bo":"ཆུ་ཚོད་དགུ་དང་སྐར་མ་ལྔ","label":"9:05"},{"id":"t9-10","kind":"time","style":"direct","value":{"hour":9,"minute":10},"bo":"ཆུ་ཚོད་དགུ་དང་སྐར་མ་བཅུ","label":"9:10"},{"id":"t9-15","kind":"time","style":"direct","value":{"hour":9,"minute":15},"bo":"ཆུ་ཚོད་དགུ་དང་སྐར་མ་བཅོ་ལྔ","label":"9:15"},{"id":"r9-15","kind":"time","style":"relative","value":{"hour":9,"minute":15},"bo":"ཆུ་ཚོད་དགུ་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ","label":"9:15"},{"id":"t9-20","kind":"time","style":"direct","value":{"hour":9,"minute":20},"bo":"ཆུ་ཚོད་དགུ་དང་སྐར་མ་ཉི་ཤུ","label":"9:20"},{"id":"t9-25","kind":"time","style":"direct","value":{"hour":9,"minute":25},"bo":"ཆུ་ཚོད་དགུ་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ","label":"9:25"},{"id":"t9-30","kind":"time","style":"direct","value":{"hour":9,"minute":30},"bo":"ཆུ་ཚོད་དགུ་དང་སྐར་མ་སུམ་ཅུ","label":"9:30"},{"id":"r9-30","kind":"time","style":"relative","value":{"hour":9,"minute":30},"bo":"ཆུ་ཚོད་དགུ་དང་ཕྱེད་ཀ","label":"9:30"},{"id":"t9-35","kind":"time","style":"direct","value":{"hour":9,"minute":35},"bo":"ཆུ་ཚོད་དགུ་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ","label":"9:35"},{"id":"t9-40","kind":"time","style":"direct","value":{"hour":9,"minute":40},"bo":"ཆུ་ཚོད་དགུ་དང་སྐར་མ་བཞི་བཅུ","label":"9:40"},{"id":"t9-45","kind":"time","style":"direct","value":{"hour":9,"minute":45},"bo":"ཆུ་ཚོད་དགུ་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ","label":"9:45"},{"id":"r9-45","kind":"time","style":"relative","value":{"hour":9,"minute":45},"bo":"ཆུ་ཚོད་བཅུ་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ","label":"9:45"},{"id":"t9-50","kind":"time","style":"direct","value":{"hour":9,"minute":50},"bo":"ཆུ་ཚོད་དགུ་དང་སྐར་མ་ལྔ་བཅུ","label":"9:50"},{"id":"t9-55","kind":"time","style":"direct","value":{"hour":9,"minute":55},"bo":"ཆུ་ཚོད་དགུ་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ","label":"9:55"},{"id":"t10-0","kind":"time","style":"direct","value":{"hour":10,"minute":0},"bo":"ཆུ་ཚོད་བཅུ་པ","label":"10:00"},{"id":"t10-5","kind":"time","style":"direct","value":{"hour":10,"minute":5},"bo":"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་ལྔ","label":"10:05"},{"id":"t10-10","kind":"time","style":"direct","value":{"hour":10,"minute":10},"bo":"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་བཅུ","label":"10:10"},{"id":"t10-15","kind":"time","style":"direct","value":{"hour":10,"minute":15},"bo":"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་བཅོ་ལྔ","label":"10:15"},{"id":"r10-15","kind":"time","style":"relative","value":{"hour":10,"minute":15},"bo":"ཆུ་ཚོད་བཅུ་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ","label":"10:15"},{"id":"t10-20","kind":"time","style":"direct","value":{"hour":10,"minute":20},"bo":"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་ཉི་ཤུ","label":"10:20"},{"id":"t10-25","kind":"time","style":"direct","value":{"hour":10,"minute":25},"bo":"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ","label":"10:25"},{"id":"t10-30","kind":"time","style":"direct","value":{"hour":10,"minute":30},"bo":"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་སུམ་ཅུ","label":"10:30"},{"id":"r10-30","kind":"time","style":"relative","value":{"hour":10,"minute":30},"bo":"ཆུ་ཚོད་བཅུ་དང་ཕྱེད་ཀ","label":"10:30"},{"id":"t10-35","kind":"time","style":"direct","value":{"hour":10,"minute":35},"bo":"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ","label":"10:35"},{"id":"t10-40","kind":"time","style":"direct","value":{"hour":10,"minute":40},"bo":"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་བཞི་བཅུ","label":"10:40"},{"id":"t10-45","kind":"time","style":"direct","value":{"hour":10,"minute":45},"bo":"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ","label":"10:45"},{"id":"r10-45","kind":"time","style":"relative","value":{"hour":10,"minute":45},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ","label":"10:45"},{"id":"t10-50","kind":"time","style":"direct","value":{"hour":10,"minute":50},"bo":"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་ལྔ་བཅུ","label":"10:50"},{"id":"t10-55","kind":"time","style":"direct","value":{"hour":10,"minute":55},"bo":"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ","label":"10:55"},{"id":"t11-0","kind":"time","style":"direct","value":{"hour":11,"minute":0},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་པ","label":"11:00"},{"id":"t11-5","kind":"time","style":"direct","value":{"hour":11,"minute":5},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་ལྔ","label":"11:05"},{"id":"t11-10","kind":"time","style":"direct","value":{"hour":11,"minute":10},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་བཅུ","label":"11:10"},{"id":"t11-15","kind":"time","style":"direct","value":{"hour":11,"minute":15},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་བཅོ་ལྔ","label":"11:15"},{"id":"r11-15","kind":"time","style":"relative","value":{"hour":11,"minute":15},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ","label":"11:15"},{"id":"t11-20","kind":"time","style":"direct","value":{"hour":11,"minute":20},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་ཉི་ཤུ","label":"11:20"},{"id":"t11-25","kind":"time","style":"direct","value":{"hour":11,"minute":25},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ","label":"11:25"},{"id":"t11-30","kind":"time","style":"direct","value":{"hour":11,"minute":30},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་སུམ་ཅུ","label":"11:30"},{"id":"r11-30","kind":"time","style":"relative","value":{"hour":11,"minute":30},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་དང་ཕྱེད་ཀ","label":"11:30"},{"id":"t11-35","kind":"time","style":"direct","value":{"hour":11,"minute":35},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ","label":"11:35"},{"id":"t11-40","kind":"time","style":"direct","value":{"hour":11,"minute":40},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་བཞི་བཅུ","label":"11:40"},{"id":"t11-45","kind":"time","style":"direct","value":{"hour":11,"minute":45},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ","label":"11:45"},{"id":"r11-45","kind":"time","style":"relative","value":{"hour":11,"minute":45},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ","label":"11:45"},{"id":"t11-50","kind":"time","style":"direct","value":{"hour":11,"minute":50},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་ལྔ་བཅུ","label":"11:50"},{"id":"t11-55","kind":"time","style":"direct","value":{"hour":11,"minute":55},"bo":"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ","label":"11:55"},{"id":"t12-0","kind":"time","style":"direct","value":{"hour":12,"minute":0},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་པ","label":"12:00"},{"id":"t12-5","kind":"time","style":"direct","value":{"hour":12,"minute":5},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་ལྔ","label":"12:05"},{"id":"t12-10","kind":"time","style":"direct","value":{"hour":12,"minute":10},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་བཅུ","label":"12:10"},{"id":"t12-15","kind":"time","style":"direct","value":{"hour":12,"minute":15},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་བཅོ་ལྔ","label":"12:15"},{"id":"r12-15","kind":"time","style":"relative","value":{"hour":12,"minute":15},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ","label":"12:15"},{"id":"t12-20","kind":"time","style":"direct","value":{"hour":12,"minute":20},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་ཉི་ཤུ","label":"12:20"},{"id":"t12-25","kind":"time","style":"direct","value":{"hour":12,"minute":25},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ","label":"12:25"},{"id":"t12-30","kind":"time","style":"direct","value":{"hour":12,"minute":30},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་སུམ་ཅུ","label":"12:30"},{"id":"r12-30","kind":"time","style":"relative","value":{"hour":12,"minute":30},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་དང་ཕྱེད་ཀ","label":"12:30"},{"id":"t12-35","kind":"time","style":"direct","value":{"hour":12,"minute":35},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ","label":"12:35"},{"id":"t12-40","kind":"time","style":"direct","value":{"hour":12,"minute":40},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་བཞི་བཅུ","label":"12:40"},{"id":"t12-45","kind":"time","style":"direct","value":{"hour":12,"minute":45},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ","label":"12:45"},{"id":"r12-45","kind":"time","style":"relative","value":{"hour":12,"minute":45},"bo":"ཆུ་ཚོད་དང་པོ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ","label":"12:45"},{"id":"t12-50","kind":"time","style":"direct","value":{"hour":12,"minute":50},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་ལྔ་བཅུ","label":"12:50"},{"id":"t12-55","kind":"time","style":"direct","value":{"hour":12,"minute":55},"bo":"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ","label":"12:55"}]};
  const INDEX={"version":1,"provider":"Monlam","voice":"lhasa_female","created":"2026-11-15","banks":[{"file":"practice-female-000.mp3","duration":56.424,"bytes":677088,"sha256":"1d164885380c5164134cc84a5106b368652fac9a23184dbeea7342608855ae57"},{"file":"practice-female-001.mp3","duration":56.544,"bytes":678528,"sha256":"3c62f324a7b3f4c1c66ee616e60922e7ba2fffebfa712cc7433019a33afc13ae"},{"file":"practice-female-002.mp3","duration":54.096,"bytes":649152,"sha256":"dde2f8dd333a6cdf6765b5742265ac21a5d46abe64034eef80c323d13ab30f5a"},{"file":"practice-female-003.mp3","duration":59.328,"bytes":711936,"sha256":"6f174c1f9b72ae3406189ced45513f353e6cf9cee16f96d351ff82a945833e7e"},{"file":"practice-female-004.mp3","duration":61.824,"bytes":741888,"sha256":"2489c791cd8ab49387a47ed94c39056b353c3845104da92906a4de393633e6b7"},{"file":"practice-female-005.mp3","duration":62.568,"bytes":750816,"sha256":"e873b5a2ef858acace462e693e717d9b07904ecb90b0e284cd4fdd4b4f0df3c1"},{"file":"practice-female-006.mp3","duration":63.816,"bytes":765792,"sha256":"d15f72fa02be7d86b65d1260cb193bfda9a70ff1e227e0ba8ee627a8ad63f2e0"},{"file":"practice-female-007.mp3","duration":61.584,"bytes":739008,"sha256":"bca8bd1b44d22e74640c9a186406cfc059230084349f9a09ea78a893736bd570"},{"file":"practice-female-008.mp3","duration":63.696,"bytes":764352,"sha256":"de91b77fb84fb26845abd371d91fb36bee8bd2b7a2a1496a5288b1449a3e865c"},{"file":"practice-female-009.mp3","duration":64.704,"bytes":776448,"sha256":"6a354d0cef74f0c27e46346121c795891531f17697bca929f62aa357dfdfb6db"},{"file":"practice-female-010.mp3","duration":63.576,"bytes":762912,"sha256":"4ad6e9a6af889c00f0410e0a89ecd0158436e221cbaf086a6d01c8ce7f146734"},{"file":"practice-female-011.mp3","duration":63.096,"bytes":757152,"sha256":"0dce0e9d915909c93f2aa849691b4c4a88661c5da2e7f5d9b98561d9213568e7"},{"file":"practice-female-012.mp3","duration":63.336,"bytes":760032,"sha256":"8bc64cb2d17a66e20daaf345f3320583e6ee6cef2be13839f1038935ba86e380"},{"file":"practice-female-013.mp3","duration":63.456,"bytes":761472,"sha256":"fde81ad28c0837d83b289718920618696a48b01dca2158420a8ae538dd4b9175"},{"file":"practice-female-014.mp3","duration":65.064,"bytes":780768,"sha256":"005b3ed51e6f3451491eb54770cb9a95eda329e8fbcf5beefc0ca6fb69e70eb4"},{"file":"practice-female-015.mp3","duration":63.888,"bytes":766656,"sha256":"2cc129d1bd9aa2ef8353d1e9be6ac008f189b1440538a0ad3cd3b36a96d92a1e"},{"file":"practice-female-016.mp3","duration":20.328,"bytes":243936,"sha256":"b4f9411ea5183b9e5338298b114473319d9c790e725dae2efe4e0b3f0232b1c3"}],"clips":{"ང":[0,0,1.14],"ཁ་ལག་བཟོ་དུས":[0,1.2,3.1],"བསམ་བློ་མང་པོ":[0,3.16,5.06],"འཁོར་གྱི་འདུག":[0,5.12,7.02],"ག་ལེར་བཞུགས":[0,7.08,8.98],"སང་ཉིན":[0,9.04,10.66],"མཇལ་ཡོང":[0,10.72,12.42],"ཚོང་པ་ཁ་ཤས་ལ":[0,12.48,14.38],"ཁེ་བཟང":[0,14.44,16.06],"ཞེ་དྲག་ཡོད་རེད":[0,16.12,18.02],"མི་མང་ཆེ་བ":[0,18.08,19.82],"མེ་ཏོག་ལ":[0,19.88,21.54],"དགའ་པོ་ཞེ་དྲག་ཡོད་རེད":[0,21.6,23.78],"མ་འོངས་པ་ལ":[0,23.84,25.66],"དགེ་རྒན":[0,25.72,27.34],"བྱེད་ཀྱི་ཡིན":[0,27.4,29.14],"ང་ཚོས":[0,29.2,30.7],"བོད་སྐད":[0,30.76,32.38],"མགྱོགས་པོ":[0,32.44,34.14],"ཤེས་སོང":[0,34.2,35.82],"ཐུག་པ་ནང་ལ":[0,35.88,37.7],"ཚྭ":[0,37.76,38.9],"མང་དྲགས་བཞག":[0,38.96,40.9],"ལམ་ཀ་ལ":[0,40.96,42.62],"གཟབ་གཟབ་བྱེད":[0,42.68,44.62],"རོགས་གནང":[0,44.68,46.46],"དེང་སང":[0,46.52,48.14],"གངས":[0,48.2,49.66],"འབབ་ཀྱི་ཡོད་མ་རེད":[0,49.72,51.78],"ཨོ":[0,51.84,52.98],"འབྲས་འདི":[0,53.04,54.74],"ཡག་པོ":[0,54.8,56.3],"ཚོས་མི་འདུག":[1,0,1.82],"དགོང་མོ":[1,1.88,3.5],"ཟླ་བ":[1,3.56,4.94],"ཤར་གྱི་རེད":[1,5.0,6.74],"ང་ཚོ":[1,6.8,8.18],"མཉམ་དུ":[1,8.24,9.86],"བོད་ལ":[1,9.92,11.42],"འགྲོ":[1,11.48,12.82],"དེབ":[1,12.88,14.22],"ལྟ་གི་ཡོད":[1,14.28,15.94],"ལོ་གཅིག་ལ":[1,16.0,17.74],"ནམ་དུས་བཞི":[1,17.8,19.62],"ཡོད་རེད":[1,19.68,21.3],"གཟའ་མཇུག་ལ":[1,21.36,23.26],"སྐྱིད་པོ་བྱུང":[1,23.32,25.06],"མ་བྱན་འདིས":[1,25.12,26.94],"ཁ་ལག་འདྲ་མི་འདྲ":[1,27.0,28.98],"བཟོ་གི་ཡོད་རེད":[1,29.04,30.94],"སྟར་ཁ་དེ་ཚོ":[1,31.0,32.74],"བཅུད་ཆེན་པོ":[1,32.8,34.62],"དེ་རིང":[1,34.68,36.18],"ངས":[1,36.24,37.58],"མཉེན་ཆས་ཞིག":[1,37.64,39.54],"བཟོས་པ་ཡིན":[1,39.6,41.42],"ཁོང་ཚོའི་སློབ་གྲྭ་ལ":[1,41.48,43.46],"ཤིང་སྡོང་མང་པོ":[1,43.52,45.42],"མི་འདུག":[1,45.48,47.1],"གོང་ཁེ་བོ་ཞེ་དྲག":[1,47.16,49.06],"རེད":[1,49.12,50.46],"མགྲོན་ཁང་མང་ཆེ་བ":[1,50.52,52.58],"གོང་ཆེན་པོ":[1,52.64,54.38],"དགོན་པ་རྩ་ཆེན་པོ":[1,54.44,56.42],"དབྱར་ཀ":[2,0,1.62],"ཚ་བ་ཆེན་པོ":[2,1.68,3.42],"ལྡི་ལི་ལ":[2,3.48,5.02],"ང་ཚོའི་སློབ་གྲྭ་ལ":[2,5.08,6.98],"དུད་འགྲོ་མང་པོ":[2,7.04,8.94],"ཉི་མ":[2,9.0,10.38],"ནུབ་ལ":[2,10.44,11.94],"ནུབ་ཀྱི་རེད":[2,12.0,13.74],"ཚིག་གསར":[2,13.8,15.5],"བློ་འཛིན་མང་པོ་བྱེད་ཀྱི་ཡོད":[2,15.56,17.78],"ངའི་གྲོགས་པོ་གྲོགས་མོ་མང་ཆེ་བ":[2,17.84,20.26],"ཕྱི་རྒྱལ་ལ":[2,20.32,21.98],"ཁྱེད་རང":[2,22.04,23.66],"ཤེས་ཀྱི་ཡོད་པས":[2,23.72,25.62],"གངས་མང་པོ":[2,25.68,27.5],"འབབ་ཀྱི་རེད":[2,27.56,29.38],"ཀླད་ཀོར":[2,29.44,31.06],"གཅིག":[2,31.12,32.58],"གཉིས":[2,32.64,34.1],"གསུམ":[2,34.16,35.62],"བཞི":[2,35.68,37.02],"ལྔ":[2,37.08,38.22],"དྲུག":[2,38.28,39.62],"བདུན":[2,39.68,41.14],"བརྒྱད":[2,41.2,42.66],"དགུ":[2,42.72,44.06],"བཅུ":[2,44.12,45.46],"བཅུ་གཅིག":[2,45.52,47.22],"བཅུ་གཉིས":[2,47.28,48.98],"བཅུ་གསུམ":[2,49.04,50.74],"བཅུ་བཞི":[2,50.8,52.42],"བཅོ་ལྔ":[2,52.48,53.98],"བཅུ་དྲུག":[3,0,1.62],"བཅུ་བདུན":[3,1.68,3.38],"བཅོ་བརྒྱད":[3,3.44,5.14],"བཅུ་དགུ":[3,5.2,6.82],"ཉི་ཤུ":[3,6.88,8.26],"ཉི་ཤུ་རྩ་གཅིག":[3,8.32,10.14],"ཉི་ཤུ་རྩ་གཉིས":[3,10.2,12.02],"ཉི་ཤུ་རྩ་གསུམ":[3,12.08,13.9],"ཉི་ཤུ་རྩ་བཞི":[3,13.96,15.7],"ཉི་ཤུ་རྩ་ལྔ":[3,15.76,17.42],"ཉི་ཤུ་རྩ་དྲུག":[3,17.48,19.22],"ཉི་ཤུ་རྩ་བདུན":[3,19.28,21.1],"ཉི་ཤུ་རྩ་བརྒྱད":[3,21.16,22.98],"ཉི་ཤུ་རྩ་དགུ":[3,23.04,24.78],"སུམ་ཅུ":[3,24.84,26.34],"སུམ་ཅུ་སོ་གཅིག":[3,26.4,28.3],"སུམ་ཅུ་སོ་གཉིས":[3,28.36,30.26],"སུམ་ཅུ་སོ་གསུམ":[3,30.32,32.22],"སུམ་ཅུ་སོ་བཞི":[3,32.28,34.1],"སུམ་ཅུ་སོ་ལྔ":[3,34.16,35.9],"སུམ་ཅུ་སོ་དྲུག":[3,35.96,37.78],"སུམ་ཅུ་སོ་བདུན":[3,37.84,39.74],"སུམ་ཅུ་སོ་བརྒྱད":[3,39.8,41.7],"སུམ་ཅུ་སོ་དགུ":[3,41.76,43.58],"བཞི་བཅུ":[3,43.64,45.26],"བཞི་བཅུ་ཞེ་གཅིག":[3,45.32,47.3],"བཞི་བཅུ་ཞེ་གཉིས":[3,47.36,49.34],"བཞི་བཅུ་ཞེ་གསུམ":[3,49.4,51.38],"བཞི་བཅུ་ཞེ་བཞི":[3,51.44,53.34],"བཞི་བཅུ་ཞེ་ལྔ":[3,53.4,55.22],"བཞི་བཅུ་ཞེ་དྲུག":[3,55.28,57.18],"བཞི་བཅུ་ཞེ་བདུན":[3,57.24,59.22],"བཞི་བཅུ་ཞེ་བརྒྱད":[4,0,1.98],"བཞི་བཅུ་ཞེ་དགུ":[4,2.04,3.94],"ལྔ་བཅུ":[4,4.0,5.5],"ལྔ་བཅུ་ང་གཅིག":[4,5.56,7.46],"ལྔ་བཅུ་ང་གཉིས":[4,7.52,9.42],"ལྔ་བཅུ་ང་གསུམ":[4,9.48,11.38],"ལྔ་བཅུ་ང་བཞི":[4,11.44,13.26],"ལྔ་བཅུ་ང་ལྔ":[4,13.32,15.06],"ལྔ་བཅུ་ང་དྲུག":[4,15.12,16.94],"ལྔ་བཅུ་ང་བདུན":[4,17.0,18.9],"ལྔ་བཅུ་ང་བརྒྱད":[4,18.96,20.86],"ལྔ་བཅུ་ང་དགུ":[4,20.92,22.74],"དྲུག་ཅུ":[4,22.8,24.3],"དྲུག་ཅུ་རེ་གཅིག":[4,24.36,26.26],"དྲུག་ཅུ་རེ་གཉིས":[4,26.32,28.22],"དྲུག་ཅུ་རེ་གསུམ":[4,28.28,30.18],"དྲུག་ཅུ་རེ་བཞི":[4,30.24,32.06],"དྲུག་ཅུ་རེ་ལྔ":[4,32.12,33.86],"དྲུག་ཅུ་རེ་དྲུག":[4,33.92,35.74],"དྲུག་ཅུ་རེ་བདུན":[4,35.8,37.7],"དྲུག་ཅུ་རེ་བརྒྱད":[4,37.76,39.66],"དྲུག་ཅུ་རེ་དགུ":[4,39.72,41.54],"བདུན་ཅུ":[4,41.6,43.22],"བདུན་ཅུ་དོན་གཅིག":[4,43.28,45.3],"བདུན་ཅུ་དོན་གཉིས":[4,45.36,47.38],"བདུན་ཅུ་དོན་གསུམ":[4,47.44,49.46],"བདུན་ཅུ་དོན་བཞི":[4,49.52,51.5],"བདུན་ཅུ་དོན་ལྔ":[4,51.56,53.46],"བདུན་ཅུ་དོན་དྲུག":[4,53.52,55.5],"བདུན་ཅུ་དོན་བདུན":[4,55.56,57.58],"བདུན་ཅུ་དོན་བརྒྱད":[4,57.64,59.66],"བདུན་ཅུ་དོན་དགུ":[4,59.72,61.7],"བརྒྱད་ཅུ":[5,0,1.62],"བརྒྱད་ཅུ་གྱ་གཅིག":[5,1.68,3.66],"བརྒྱད་ཅུ་གྱ་གཉིས":[5,3.72,5.7],"བརྒྱད་ཅུ་གྱ་གསུམ":[5,5.76,7.74],"བརྒྱད་ཅུ་གྱ་བཞི":[5,7.8,9.7],"བརྒྱད་ཅུ་གྱ་ལྔ":[5,9.76,11.58],"བརྒྱད་ཅུ་གྱ་དྲུག":[5,11.64,13.54],"བརྒྱད་ཅུ་གྱ་བདུན":[5,13.6,15.58],"བརྒྱད་ཅུ་གྱ་བརྒྱད":[5,15.64,17.62],"བརྒྱད་ཅུ་གྱ་དགུ":[5,17.68,19.58],"དགུ་བཅུ":[5,19.64,21.26],"དགུ་བཅུ་གོ་གཅིག":[5,21.32,23.3],"དགུ་བཅུ་གོ་གཉིས":[5,23.36,25.34],"དགུ་བཅུ་གོ་གསུམ":[5,25.4,27.38],"དགུ་བཅུ་གོ་བཞི":[5,27.44,29.34],"དགུ་བཅུ་གོ་ལྔ":[5,29.4,31.22],"དགུ་བཅུ་གོ་དྲུག":[5,31.28,33.18],"དགུ་བཅུ་གོ་བདུན":[5,33.24,35.22],"དགུ་བཅུ་གོ་བརྒྱད":[5,35.28,37.26],"དགུ་བཅུ་གོ་དགུ":[5,37.32,39.22],"བརྒྱ":[5,39.28,40.62],"བརྒྱ་དང་གཅིག":[5,40.68,42.58],"བརྒྱ་དང་ལྔ":[5,42.64,44.38],"བརྒྱ་དང་བཅུ":[5,44.44,46.26],"བརྒྱ་དང་བཅུ་གཅིག":[5,46.32,48.34],"བརྒྱ་དང་ཉི་ཤུ":[5,48.4,50.22],"བརྒྱ་དང་ཉི་ཤུ་རྩ་གཅིག":[5,50.28,52.38],"བརྒྱ་དང་ལྔ་བཅུ":[5,52.44,54.34],"བརྒྱ་དང་དགུ་བཅུ་གོ་དགུ":[5,54.4,56.58],"ཉིས་བརྒྱ":[5,56.64,58.26],"ཉིས་བརྒྱ་དང་གཅིག":[5,58.32,60.34],"ཉིས་བརྒྱ་དང་ལྔ་བཅུ":[5,60.4,62.46],"སུམ་བརྒྱ":[6,0,1.62],"སུམ་བརྒྱ་དང་སུམ་ཅུ་སོ་གསུམ":[6,1.68,3.94],"ལྔ་བརྒྱ":[6,4.0,5.5],"བདུན་བརྒྱ་དང་ལྔ་བཅུ":[6,5.56,7.66],"དགུ་བརྒྱ་དང་དགུ་བཅུ་གོ་དགུ":[6,7.72,9.98],"ཆིག་སྟོང":[6,10.04,11.66],"ཆིག་སྟོང་དང་གཅིག":[6,11.72,13.74],"ཆིག་སྟོང་དང་བཅུ":[6,13.8,15.78],"ཆིག་སྟོང་དང་བརྒྱ":[6,15.84,17.82],"ཆིག་སྟོང་དང་ཉིས་བརྒྱ་དང་ལྔ་བཅུ":[6,17.88,20.42],"ཆིག་སྟོང་དང་ལྔ་བརྒྱ":[6,20.48,22.54],"ཉིས་སྟོང":[6,22.6,24.22],"ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག":[6,24.28,26.46],"ལྔ་སྟོང":[6,26.52,28.02],"ཆིག་ཁྲི":[6,28.08,29.58],"ཆིག་འབུམ":[6,29.64,31.34],"ས་ཡ་གཅིག":[6,31.4,33.14],"དུང་ཕྱུར་གཅིག":[6,33.2,35.1],"དུང་ཕྱུར་བཅུ":[6,35.16,36.98],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་དང་པོའི་ཚེས་པ་གཅིག":[6,37.04,41.06],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་དང་པོའི་ཚེས་པ་བཅོ་ལྔ":[6,41.12,45.3],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་དང་པོའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད":[6,45.36,50.14],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་གཉིས་པའི་ཚེས་པ་གཅིག":[6,50.2,54.46],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་གཉིས་པའི་ཚེས་པ་བཅོ་ལྔ":[6,54.52,58.98],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་གཉིས་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་དགུ":[6,59.04,63.7],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་གསུམ་པའི་ཚེས་པ་གཅིག":[7,0,4.42],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་གསུམ་པའི་ཚེས་པ་བཅོ་ལྔ":[7,4.48,8.78],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་གསུམ་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད":[7,8.84,13.5],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་བཞི་པའི་ཚེས་པ་གཅིག":[7,13.56,17.7],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་བཞི་པའི་ཚེས་པ་བཅོ་ལྔ":[7,17.76,21.82],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་བཞི་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད":[7,21.88,26.54],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་ལྔ་པའི་ཚེས་པ་གཅིག":[7,26.6,30.5],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་ལྔ་པའི་ཚེས་པ་བཅོ་ལྔ":[7,30.56,34.62],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་ལྔ་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད":[7,34.68,39.34],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་དྲུག་པའི་ཚེས་པ་གཅིག":[7,39.4,43.54],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་དྲུག་པའི་ཚེས་པ་བཅོ་ལྔ":[7,43.6,47.9],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་དྲུག་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད":[7,47.96,52.62],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་བདུན་པའི་ཚེས་པ་གཅིག":[7,52.68,57.1],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་བདུན་པའི་ཚེས་པ་བཅོ་ལྔ":[7,57.16,61.46],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་བདུན་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད":[8,0,4.66],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་བརྒྱད་པའི་ཚེས་པ་གཅིག":[8,4.72,8.98],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་བརྒྱད་པའི་ཚེས་པ་བཅོ་ལྔ":[8,9.04,13.22],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་བརྒྱད་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད":[8,13.28,18.06],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་དགུ་པའི་ཚེས་པ་གཅིག":[8,18.12,22.14],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་དགུ་པའི་ཚེས་པ་བཅོ་ལྔ":[8,22.2,26.38],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་དགུ་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད":[8,26.44,31.22],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་བཅུ་པའི་ཚེས་པ་གཅིག":[8,31.28,35.42],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་བཅུ་པའི་ཚེས་པ་བཅོ་ལྔ":[8,35.48,39.78],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་བཅུ་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད":[8,39.84,44.5],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བདུན་ཕྱི་ཟླ་བཅུ་གཅིག་པའི་ཚེས་པ་གཅིག":[8,44.56,49.26],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་བཅུ་གཅིག་པའི་ཚེས་པ་བཅོ་ལྔ":[8,49.32,53.94],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་བཅུ་གཅིག་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད":[8,54.0,58.94],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་བཞི་ཕྱི་ཟླ་བཅུ་གཉིས་པའི་ཚེས་པ་གཅིག":[8,59.0,63.58],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་ལྔ་ཕྱི་ཟླ་བཅུ་གཉིས་པའི་ཚེས་པ་བཅོ་ལྔ":[9,0,4.46],"ཕྱི་ལོ་ཉིས་སྟོང་དང་ཉི་ཤུ་རྩ་དྲུག་ཕྱི་ཟླ་བཅུ་གཉིས་པའི་ཚེས་པ་ཉི་ཤུ་རྩ་བརྒྱད":[9,4.52,9.58],"ཆུ་ཚོད་དང་པོ":[9,9.64,11.46],"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་ལྔ":[9,11.52,13.74],"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་བཅུ":[9,13.8,16.06],"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་བཅོ་ལྔ":[9,16.12,18.54],"ཆུ་ཚོད་དང་པོ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ":[9,18.6,21.34],"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་ཉི་ཤུ":[9,21.4,23.66],"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ":[9,23.72,26.34],"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་སུམ་ཅུ":[9,26.4,28.82],"ཆུ་ཚོད་གཅིག་དང་ཕྱེད་ཀ":[9,28.88,31.06],"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ":[9,31.12,33.86],"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་བཞི་བཅུ":[9,33.92,36.46],"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ":[9,36.52,39.38],"ཆུ་ཚོད་གཉིས་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ":[9,39.44,42.34],"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་ལྔ་བཅུ":[9,42.4,44.82],"ཆུ་ཚོད་གཅིག་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ":[9,44.88,47.62],"ཆུ་ཚོད་གཉིས་པ":[9,47.68,49.58],"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་ལྔ":[9,49.64,51.86],"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་བཅུ":[9,51.92,54.18],"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་བཅོ་ལྔ":[9,54.24,56.66],"ཆུ་ཚོད་གཉིས་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ":[9,56.72,59.58],"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་ཉི་ཤུ":[9,59.64,61.9],"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ":[9,61.96,64.58],"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་སུམ་ཅུ":[10,0,2.42],"ཆུ་ཚོད་གཉིས་དང་ཕྱེད་ཀ":[10,2.48,4.66],"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ":[10,4.72,7.46],"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་བཞི་བཅུ":[10,7.52,10.06],"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ":[10,10.12,12.98],"ཆུ་ཚོད་གསུམ་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ":[10,13.04,15.94],"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་ལྔ་བཅུ":[10,16.0,18.42],"ཆུ་ཚོད་གཉིས་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ":[10,18.48,21.22],"ཆུ་ཚོད་གསུམ་པ":[10,21.28,23.18],"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་ལྔ":[10,23.24,25.46],"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་བཅུ":[10,25.52,27.78],"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་བཅོ་ལྔ":[10,27.84,30.26],"ཆུ་ཚོད་གསུམ་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ":[10,30.32,33.18],"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་ཉི་ཤུ":[10,33.24,35.5],"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ":[10,35.56,38.18],"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་སུམ་ཅུ":[10,38.24,40.66],"ཆུ་ཚོད་གསུམ་དང་ཕྱེད་ཀ":[10,40.72,42.9],"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ":[10,42.96,45.7],"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་བཞི་བཅུ":[10,45.76,48.3],"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ":[10,48.36,51.22],"ཆུ་ཚོད་བཞི་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ":[10,51.28,54.06],"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་ལྔ་བཅུ":[10,54.12,56.54],"ཆུ་ཚོད་གསུམ་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ":[10,56.6,59.34],"ཆུ་ཚོད་བཞི་པ":[10,59.4,61.22],"ཆུ་ཚོད་བཞི་དང་སྐར་མ་ལྔ":[10,61.28,63.46],"ཆུ་ཚོད་བཞི་དང་སྐར་མ་བཅུ":[11,0,2.22],"ཆུ་ཚོད་བཞི་དང་སྐར་མ་བཅོ་ལྔ":[11,2.28,4.54],"ཆུ་ཚོད་བཞི་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ":[11,4.6,7.34],"ཆུ་ཚོད་བཞི་དང་སྐར་མ་ཉི་ཤུ":[11,7.4,9.62],"ཆུ་ཚོད་བཞི་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ":[11,9.68,12.18],"ཆུ་ཚོད་བཞི་དང་སྐར་མ་སུམ་ཅུ":[11,12.24,14.5],"ཆུ་ཚོད་བཞི་དང་ཕྱེད་ཀ":[11,14.56,16.66],"ཆུ་ཚོད་བཞི་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ":[11,16.72,19.34],"ཆུ་ཚོད་བཞི་དང་སྐར་མ་བཞི་བཅུ":[11,19.4,21.82],"ཆུ་ཚོད་བཞི་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ":[11,21.88,24.62],"ཆུ་ཚོད་ལྔ་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ":[11,24.68,27.34],"ཆུ་ཚོད་བཞི་དང་སྐར་མ་ལྔ་བཅུ":[11,27.4,29.66],"ཆུ་ཚོད་བཞི་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ":[11,29.72,32.34],"ཆུ་ཚོད་ལྔ་པ":[11,32.4,34.14],"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་ལྔ":[11,34.2,36.34],"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་བཅུ":[11,36.4,38.58],"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་བཅོ་ལྔ":[11,38.64,40.86],"ཆུ་ཚོད་ལྔ་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ":[11,40.92,43.54],"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་ཉི་ཤུ":[11,43.6,45.78],"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ":[11,45.84,48.18],"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་སུམ་ཅུ":[11,48.24,50.46],"ཆུ་ཚོད་ལྔ་དང་ཕྱེད་ཀ":[11,50.52,52.58],"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ":[11,52.64,55.14],"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་བཞི་བཅུ":[11,55.2,57.46],"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ":[11,57.52,60.14],"ཆུ་ཚོད་དྲུག་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ":[11,60.2,62.98],"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་ལྔ་བཅུ":[12,0,2.22],"ཆུ་ཚོད་ལྔ་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ":[12,2.28,4.78],"ཆུ་ཚོད་དྲུག་པ":[12,4.84,6.66],"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་ལྔ":[12,6.72,8.9],"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་བཅུ":[12,8.96,11.18],"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་བཅོ་ལྔ":[12,11.24,13.5],"ཆུ་ཚོད་དྲུག་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ":[12,13.56,16.3],"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་ཉི་ཤུ":[12,16.36,18.58],"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ":[12,18.64,21.14],"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་སུམ་ཅུ":[12,21.2,23.46],"ཆུ་ཚོད་དྲུག་དང་ཕྱེད་ཀ":[12,23.52,25.62],"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ":[12,25.68,28.3],"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་བཞི་བཅུ":[12,28.36,30.78],"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ":[12,30.84,33.58],"ཆུ་ཚོད་བདུན་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ":[12,33.64,36.54],"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་ལྔ་བཅུ":[12,36.6,38.86],"ཆུ་ཚོད་དྲུག་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ":[12,38.92,41.54],"ཆུ་ཚོད་བདུན་པ":[12,41.6,43.5],"ཆུ་ཚོད་བདུན་དང་སྐར་མ་ལྔ":[12,43.56,45.78],"ཆུ་ཚོད་བདུན་དང་སྐར་མ་བཅུ":[12,45.84,48.1],"ཆུ་ཚོད་བདུན་དང་སྐར་མ་བཅོ་ལྔ":[12,48.16,50.58],"ཆུ་ཚོད་བདུན་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ":[12,50.64,53.5],"ཆུ་ཚོད་བདུན་དང་སྐར་མ་ཉི་ཤུ":[12,53.56,55.82],"ཆུ་ཚོད་བདུན་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ":[12,55.88,58.5],"ཆུ་ཚོད་བདུན་དང་སྐར་མ་སུམ་ཅུ":[12,58.56,60.98],"ཆུ་ཚོད་བདུན་དང་ཕྱེད་ཀ":[12,61.04,63.22],"ཆུ་ཚོད་བདུན་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ":[13,0,2.74],"ཆུ་ཚོད་བདུན་དང་སྐར་མ་བཞི་བཅུ":[13,2.8,5.34],"ཆུ་ཚོད་བདུན་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ":[13,5.4,8.26],"ཆུ་ཚོད་བརྒྱད་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ":[13,8.32,11.22],"ཆུ་ཚོད་བདུན་དང་སྐར་མ་ལྔ་བཅུ":[13,11.28,13.7],"ཆུ་ཚོད་བདུན་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ":[13,13.76,16.5],"ཆུ་ཚོད་བརྒྱད་པ":[13,16.56,18.46],"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་ལྔ":[13,18.52,20.74],"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་བཅུ":[13,20.8,23.06],"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་བཅོ་ལྔ":[13,23.12,25.54],"ཆུ་ཚོད་བརྒྱད་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ":[13,25.6,28.46],"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་ཉི་ཤུ":[13,28.52,30.78],"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ":[13,30.84,33.46],"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་སུམ་ཅུ":[13,33.52,35.94],"ཆུ་ཚོད་བརྒྱད་དང་ཕྱེད་ཀ":[13,36.0,38.18],"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ":[13,38.24,40.98],"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་བཞི་བཅུ":[13,41.04,43.58],"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ":[13,43.64,46.5],"ཆུ་ཚོད་དགུ་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ":[13,46.56,49.34],"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་ལྔ་བཅུ":[13,49.4,51.82],"ཆུ་ཚོད་བརྒྱད་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ":[13,51.88,54.62],"ཆུ་ཚོད་དགུ་པ":[13,54.68,56.5],"ཆུ་ཚོད་དགུ་དང་སྐར་མ་ལྔ":[13,56.56,58.74],"ཆུ་ཚོད་དགུ་དང་སྐར་མ་བཅུ":[13,58.8,61.02],"ཆུ་ཚོད་དགུ་དང་སྐར་མ་བཅོ་ལྔ":[13,61.08,63.34],"ཆུ་ཚོད་དགུ་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ":[14,0,2.74],"ཆུ་ཚོད་དགུ་དང་སྐར་མ་ཉི་ཤུ":[14,2.8,5.02],"ཆུ་ཚོད་དགུ་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ":[14,5.08,7.58],"ཆུ་ཚོད་དགུ་དང་སྐར་མ་སུམ་ཅུ":[14,7.64,9.9],"ཆུ་ཚོད་དགུ་དང་ཕྱེད་ཀ":[14,9.96,12.06],"ཆུ་ཚོད་དགུ་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ":[14,12.12,14.74],"ཆུ་ཚོད་དགུ་དང་སྐར་མ་བཞི་བཅུ":[14,14.8,17.22],"ཆུ་ཚོད་དགུ་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ":[14,17.28,20.02],"ཆུ་ཚོད་བཅུ་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ":[14,20.08,22.86],"ཆུ་ཚོད་དགུ་དང་སྐར་མ་ལྔ་བཅུ":[14,22.92,25.18],"ཆུ་ཚོད་དགུ་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ":[14,25.24,27.86],"ཆུ་ཚོད་བཅུ་པ":[14,27.92,29.74],"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་ལྔ":[14,29.8,31.98],"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་བཅུ":[14,32.04,34.26],"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་བཅོ་ལྔ":[14,34.32,36.58],"ཆུ་ཚོད་བཅུ་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ":[14,36.64,39.38],"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་ཉི་ཤུ":[14,39.44,41.66],"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ":[14,41.72,44.22],"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་སུམ་ཅུ":[14,44.28,46.54],"ཆུ་ཚོད་བཅུ་དང་ཕྱེད་ཀ":[14,46.6,48.7],"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ":[14,48.76,51.38],"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་བཞི་བཅུ":[14,51.44,53.86],"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ":[14,53.92,56.66],"ཆུ་ཚོད་བཅུ་གཅིག་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ":[14,56.72,59.94],"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་ལྔ་བཅུ":[14,60.0,62.26],"ཆུ་ཚོད་བཅུ་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ":[14,62.32,64.94],"ཆུ་ཚོད་བཅུ་གཅིག་པ":[15,0,2.06],"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་ལྔ":[15,2.12,4.54],"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་བཅུ":[15,4.6,7.14],"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་བཅོ་ལྔ":[15,7.2,9.9],"ཆུ་ཚོད་བཅུ་གཅིག་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ":[15,9.96,13.14],"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་ཉི་ཤུ":[15,13.2,15.78],"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ":[15,15.84,18.74],"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་སུམ་ཅུ":[15,18.8,21.5],"ཆུ་ཚོད་བཅུ་གཅིག་དང་ཕྱེད་ཀ":[15,21.56,23.82],"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ":[15,23.88,26.94],"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་བཞི་བཅུ":[15,27.0,29.82],"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ":[15,29.88,33.06],"ཆུ་ཚོད་བཅུ་གཉིས་པ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ":[15,33.12,36.34],"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་ལྔ་བཅུ":[15,36.4,39.1],"ཆུ་ཚོད་བཅུ་གཅིག་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ":[15,39.16,42.22],"ཆུ་ཚོད་བཅུ་གཉིས་པ":[15,42.28,44.34],"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་ལྔ":[15,44.4,46.82],"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་བཅུ":[15,46.88,49.42],"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་བཅོ་ལྔ":[15,49.48,52.18],"ཆུ་ཚོད་བཅུ་གཉིས་པ་ཟིན་ནས་སྐར་མ་བཅོ་ལྔ":[15,52.24,55.42],"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་ཉི་ཤུ":[15,55.48,58.06],"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་ཉི་ཤུ་རྩ་ལྔ":[15,58.12,61.02],"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་སུམ་ཅུ":[15,61.08,63.78],"ཆུ་ཚོད་བཅུ་གཉིས་དང་ཕྱེད་ཀ":[16,0,2.26],"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་སུམ་ཅུ་སོ་ལྔ":[16,2.32,5.38],"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་བཞི་བཅུ":[16,5.44,8.26],"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་བཞི་བཅུ་ཞེ་ལྔ":[16,8.32,11.5],"ཆུ་ཚོད་དང་པོ་ཟིན་ཡ་ལ་སྐར་མ་བཅོ་ལྔ":[16,11.56,14.34],"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་ལྔ་བཅུ":[16,14.4,17.1],"ཆུ་ཚོད་བཅུ་གཉིས་དང་སྐར་མ་ལྔ་བཅུ་ང་ལྔ":[16,17.16,20.22]},"counts":{"lessons":30,"segments":96,"numericTasks":347}};
  const AUDIO_BASE='https://raw.githubusercontent.com/monsheri12-ui/tashi-in-tibet/068d689afcf2aef4265f55dc95fff65fa12c5f79/trainer-monlam-215106809/practice-v1/audio/';
  const KEY='tws-monlam-listening-v1';
  const ANSWERS=window.TWSListenAnswers;
  let root, shell, launcher, panel, recorderView, recorder;
  const baseButtonIds=new WeakMap();let baseButtonCounter=0;
  let currentMode='', ref=null, baseRef=null, baseGeneration=0, rate=1;
  let lessonIndex=0, heard=new Set(), wholeHeard=false;
  let kind='number', timeStyle='direct', numberRange='100';
  let currentTask=null, selectedClock='', clockInput=false, taskCounted=false, usedHint=false;
  let session={done:0,correct:0,hints:0}, recent=[];
  let state={version:1,completed:[],stats:{number:{done:0,correct:0},date:{done:0,correct:0},time:{done:0,correct:0}}};
  try {
    const saved=JSON.parse(localStorage.getItem(KEY)||'null');
    if (saved && saved.version===1) {
      state.completed=Array.isArray(saved.completed)?saved.completed.filter(id=>DATA.lessons.some(l=>l.id===id)):[];
      ['number','date','time'].forEach(k=>{
        const v=saved.stats && saved.stats[k];
        if(v && Number.isSafeInteger(v.done) && Number.isSafeInteger(v.correct) && v.done>=0 && v.correct>=0 && v.correct<=v.done)
          state.stats[k]={done:v.done,correct:v.correct};
      });
    }
  } catch (_) {}
  function save() { try { localStorage.setItem(KEY,JSON.stringify(state)); } catch (_) {} }
  function node(tag, cls, text) {
    const el=document.createElement(tag); if(cls)el.className=cls;
    if(text!==undefined)el.textContent=text; return el;
  }
  function button(text, action, primary) {
    const b=node('button','af-button'+(primary?' af-primary':''),text);b.type='button';
    if(action)b.addEventListener('click',action);return b;
  }
  function normalize(text) {
    return String(text||'').normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\u0F0C/g,'་').replace(/\s+/g,' ').trim().replace(/[་།༎༏༐༑༔\s]+$/g,'');
  }
  function clip(text) {
    const span=INDEX.clips[normalize(text)];
    if(span){
      const bank=INDEX.banks[span[0]],u=new URL(bank.file,AUDIO_BASE);
      const local=['127.0.0.1','localhost','[::1]'].includes(location.hostname) && ['127.0.0.1','localhost','[::1]'].includes(u.hostname);
      if((u.protocol!=='https:' && !(u.protocol==='http:'&&local))||u.username||u.password||u.hash)return null;
      return {url:u.href,start:span[1],end:span[2]};
    }
    return window.TWSMonlam && window.TWSMonlam.clip(text);
  }
  function stopBase() {
    const stop=root && root.querySelector('[data-audio-stop]');
    if(stop && !stop.disabled)stop.click();
  }
  const player={
    active:null,
    stop:function(message) {
      const a=this.active;this.active=null;
      if(!a)return;
      clearInterval(a.timer);clearTimeout(a.timeout);
      a.audio.muted=true;a.audio.pause();a.audio.removeAttribute('src');a.audio.load();
      if(a.button){
        a.button.classList.remove('is-playing');
        const icon=a.button.querySelector('.af-play-icon');if(icon)icon.textContent='▶';
        if(a.button.dataset.afIdleLabel)a.button.setAttribute('aria-label',a.button.dataset.afIdleLabel);
      }
      if(message && a.status)a.status.textContent=message;
    },
    play:function(text, target, status, complete) {
      this.stop();stopBase();if(recorder){recorder.stopPlayback();recorder.notify();}
      const source=clip(text);
      if(!source){status.textContent='Эта запись пока недоступна. Обновите страницу и попробуйте ещё раз.';return;}
      const audio=new Audio(),active={audio:audio,status:status,button:target,timer:null,timeout:null,ready:false,seekAttempts:0};
      this.active=active;
      const live=()=>this.active===active;
      const fail=()=>{if(live()){this.stop();status.classList.add('af-error');status.textContent='Не удалось включить запись. Проверьте соединение и нажмите ещё раз.';}};
      const end=()=>{if(live()){this.stop();status.textContent='Запись закончилась. Можно прослушать ещё раз.';if(complete)complete();}};
      const inRange=()=>audio.currentTime>=source.start-.025 && audio.currentTime<source.end;
      const seek=()=>{
        if(!live() || !Number.isFinite(audio.duration))return;
        if(audio.duration+.005<source.end){fail();return;}
        if(inRange()){active.ready=true;audio.muted=false;clearTimeout(active.timeout);}
        else if(!audio.seeking && active.seekAttempts<3){
          active.seekAttempts++;try{audio.currentTime=source.start;}catch(_){fail();}
        }
      };
      audio.preload='auto';audio.muted=true;audio.playbackRate=rate;audio.defaultPlaybackRate=rate;
      if('preservesPitch' in audio)audio.preservesPitch=true;
      audio.addEventListener('loadedmetadata',seek);
      audio.addEventListener('seeked',seek);
      audio.addEventListener('canplay',seek);
      audio.addEventListener('playing',seek);
      audio.addEventListener('error',fail);
      audio.addEventListener('ended',()=>audio.currentTime>=source.end-.03?end():fail());
      active.timer=setInterval(()=>{
        if(!live() || !active.ready)return;
        if(audio.currentTime>=source.end-.008)end();
      },20);
      active.timeout=setTimeout(fail,25000);
      status.classList.remove('af-error');status.textContent='Воспроизведение…';
      if(target){
        target.classList.add('is-playing');
        const icon=target.querySelector('.af-play-icon');if(icon)icon.textContent='■';
        target.setAttribute('aria-label','Остановить: '+(target.dataset.afIdleLabel||'запись'));
      }
      audio.src=source.url;
      try{const promise=audio.play();if(promise && promise.catch)promise.catch(fail);}catch(_){fail();}
    }
  };
  function changeReference(next) {
    if(!ref || !next || ref.key!==next.key){if(recorder)recorder.clear();if(recorderView)recorderView.open=false;}
    ref=next;
    if(recorderView) {
      const label=recorderView.querySelector('[data-af-ref-label]'),text=next?next.label:'Текущая запись';
      if(label.textContent!==text)label.textContent=text;
      recorderView.querySelector('[data-af-reference]').disabled=!next;
    }
  }
  function makeRecorder(){
    recorderView=node('details','af-recorder');
    recorderView.setAttribute('aria-label','Запись и сравнение своего голоса');
    recorderView.appendChild(node('summary','','Послушай себя'));
    recorderView.appendChild(node('p','','Послушайте образец, запишите свой голос и сравните две записи.'));
    const label=node('p','','Текущая запись');label.dataset.afRefLabel='';recorderView.appendChild(label);
    const bar=node('div','af-bar');
    const sample=button('▶ Образец Monlam',()=>{
      if(!ref)return;
      recorder.stopPlayback();recorder.notify();
      if(['requesting','recording'].includes(recorder.state))recorder.stop();
      ref.play();
    });sample.dataset.afReference='';
    const record=button('● Записать себя',()=>{
      if(['requesting','recording'].includes(recorder.state)){recorder.stop();return;}
      player.stop();stopBase();recorder.start();
    });record.dataset.afRecord='';
    const listen=button('▶ Моя запись',()=>{
      player.stop();stopBase();
      if(recorder.state==='playing'){recorder.stopPlayback();recorder.notify();}
      else recorder.listen();
    });listen.dataset.afListen='';listen.disabled=true;
    const clear=button('Удалить запись',()=>recorder.clear());clear.dataset.afClear='';clear.disabled=true;
    bar.append(sample,record,listen,clear);recorderView.appendChild(bar);
    const live=node('p','af-rec-status');live.dataset.afRecStatus='';live.setAttribute('role','status');live.setAttribute('aria-live','polite');recorderView.appendChild(live);
    recorderView.appendChild(node('p','','До 45 секунд. Запись остаётся на этой странице и никуда не отправляется. При смене задания или обновлении страницы она удаляется.'));
    const env={mediaDevices:navigator.mediaDevices,MediaRecorder:window.MediaRecorder,Audio:window.Audio,Blob:window.Blob,URL:window.URL,
      setTimeout:window.setTimeout.bind(window),clearTimeout:window.clearTimeout.bind(window),
      setInterval:window.setInterval.bind(window),clearInterval:window.clearInterval.bind(window)};
    recorder=new window.TWSLocalRecorder(env,s=>{
      recorderView.dataset.state=s.state;
      if(['requesting','recording','playing'].includes(s.state))recorderView.open=true;
      record.disabled=!s.supported;
      record.textContent=s.state==='recording'?'■ Завершить запись · '+s.seconds+' с':s.state==='requesting'?'Отменить запрос микрофона':'● Записать себя';
      sample.disabled=!ref || s.state==='requesting' || s.state==='recording';
      listen.disabled=!s.url || s.state==='requesting' || s.state==='recording';
      listen.hidden=!s.url;clear.hidden=!s.url;
      listen.textContent=s.state==='playing'?'■ Остановить свою запись':'▶ Моя запись';
      clear.disabled=!s.url;
      live.textContent=s.message || (s.supported?'Нажмите «Записать себя», когда будете готовы.':'В этом браузере запись недоступна. Образец Monlam можно слушать без микрофона.');
    });
    recorder.notify();
  }
  function attachRecorder(container,next) {
    changeReference(next);
    if(recorderView.parentElement!==container)container.appendChild(recorderView);
    recorderView.hidden=false;
  }
  function audioButton(text,label,status,done,key){
    const b=button('',null,true);b.classList.add('af-play');b.dataset.afPlay=key||normalize(text);
    b.dataset.afIdleLabel=label;b.setAttribute('aria-label',label);
    b.append(node('span','af-play-icon','▶'),node('span','',label));
    const play=()=>{
      if(player.active && player.active.button===b){player.stop('Воспроизведение остановлено.');return;}
      changeReference({key:key||normalize(text),label:label,play:()=>player.play(text,b,status,done)});
      player.play(text,b,status,done);
    };
    b.addEventListener('click',play);return b;
  }
  function settings(container,status) {
    const disclosure=node('details','af-settings');disclosure.appendChild(node('summary','','Настройки аудио'));
    const bar=node('div','af-bar');bar.appendChild(node('span','af-note','Скорость'));
    [0.75,1].forEach(value=>{
      const b=button(value===1?'1×':'0,75×',()=>{
        rate=value;
        bar.querySelectorAll('[data-af-rate]').forEach(x=>x.setAttribute('aria-pressed',String(Number(x.dataset.afRate)===rate)));
        if(player.active)player.active.audio.playbackRate=rate;
      });b.dataset.afRate=String(value);b.setAttribute('aria-pressed',String(value===rate));bar.appendChild(b);
    });
    bar.appendChild(button('Остановить',()=>{
      player.stop('Воспроизведение остановлено.');stopBase();recorder.stopPlayback();recorder.notify();
    }));
    disclosure.appendChild(bar);container.appendChild(disclosure);
    container.appendChild(status);
  }
  function details(label,bo,ru,cls){
    const d=node('details',cls||'');d.appendChild(node('summary','',label));
    if(bo){const b=node('p','af-bo',bo);b.lang='bo';d.appendChild(b);}
    if(ru)d.appendChild(node('p','af-ru',ru));return d;
  }
  function heading(title,kicker){
    const top=node('div','af-top'),left=node('div');
    left.append(node('p','af-kicker',kicker),node('h3','',title));
    const close=button('← К упражнениям',closePanel);close.dataset.afClose='';
    top.append(left,close);panel.appendChild(top);
  }
  function openPanel(mode){
    player.stop();stopBase();recorder.clear();currentMode=mode;
    root.dataset.audioFeatureMode=mode;
    launcher.querySelectorAll('[data-af-open]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.afOpen===mode)));
    panel.hidden=false;
    if(mode==='sentences')renderLesson();else{session={done:0,correct:0,hints:0};nextNumeric();}
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function closePanel(){
    player.stop();recorder.clear();changeReference(null);currentMode='';root.dataset.audioFeatureMode='';
    panel.hidden=true;
    launcher.querySelectorAll('[data-af-open]').forEach(b=>b.setAttribute('aria-pressed','false'));
    installBaseRecorder();launcher.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function lessonReference(lesson,status,fullButton){
    return {key:lesson.id+':whole',label:'Предложение целиком',play:()=>player.play(lesson.bo,fullButton,status,()=>{wholeHeard=true;updateLessonHeard();})};
  }
  function updateLessonHeard(){
    const el=panel.querySelector('[data-af-heard]');
    if(el){el.hidden=!wholeHeard&&!heard.size;el.textContent=(wholeHeard?'Целиком: прослушано':'Целиком: ещё не прослушано')+' · Фрагменты: '+heard.size+' из '+DATA.lessons[lessonIndex].segments.length;}
  }
  function renderLesson(){
    player.stop();recorder.clear();panel.replaceChildren();heard=new Set();wholeHeard=false;
    const lesson=DATA.lessons[lessonIndex];panel.dataset.afLesson=lesson.id;
    heading('Разбери предложение на слух','Monlam · женский голос');
    panel.appendChild(node('p','af-note','Послушайте фразу. Непонятные фрагменты можно открыть ниже.'));
    const controls=node('div','af-controls'),label=node('label','af-field','Предложение');
    const select=node('select');select.dataset.afLessonSelect='';select.setAttribute('aria-label','Выберите предложение для разбора');
    DATA.lessons.forEach((l,i)=>{const o=node('option','',String(i+1).padStart(2,'0')+'. '+l.title+(state.completed.includes(l.id)?' ✓':''));o.value=String(i);select.appendChild(o);});
    select.value=String(lessonIndex);
    select.addEventListener('change',()=>{lessonIndex=Number(select.value);renderLesson();});
    label.appendChild(select);controls.appendChild(label);
    controls.appendChild(node('p','af-mini-progress','Разобрано: '+state.completed.length+' из '+DATA.lessons.length));panel.appendChild(controls);
    const progress=node('div','af-progress'),fill=node('span');fill.style.width=(state.completed.length/DATA.lessons.length*100)+'%';progress.appendChild(fill);panel.appendChild(progress);
    const status=node('p','af-live');status.dataset.afLive='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const full=audioButton(lesson.bo,'Предложение целиком',status,()=>{wholeHeard=true;updateLessonHeard();},lesson.id+':whole');full.dataset.afWhole='';
    panel.appendChild(full);settings(panel,status);
    const heardLine=node('p','af-mini-progress');heardLine.dataset.afHeard='';panel.appendChild(heardLine);
    const pieces=node('div','af-pieces');
    lesson.segments.forEach((seg,i)=>{
      const box=node('article','af-piece');box.dataset.afSegment=String(i);
      const top=node('div','af-piece-top');top.appendChild(node('span','af-piece-num','Фрагмент '+(i+1)));
      const play=audioButton(seg.bo,'Послушать фрагмент '+(i+1),status,()=>{
        heard.add(i);updateLessonHeard();box.dataset.heard='true';
      },lesson.id+':'+i);
      play.classList.remove('af-primary');top.appendChild(play);box.appendChild(top);
      const d=details('Открыть текст и значение',seg.bo,seg.ru);d.dataset.afSegmentReveal=String(i);
      box.appendChild(d);pieces.appendChild(box);
    });
    const breakdown=node('details','af-breakdown');
    breakdown.appendChild(node('summary','','Разобрать по фрагментам · '+lesson.segments.length));
    breakdown.appendChild(pieces);panel.appendChild(breakdown);
    const whole=details('Открыть целое предложение и перевод',lesson.bo,lesson.ru,'af-full-text');whole.dataset.afFullReveal='';panel.appendChild(whole);
    const backToWhole=button('▶ Снова целое предложение',()=>full.click());backToWhole.dataset.afWholeAgain='';backToWhole.hidden=true;
    breakdown.addEventListener('toggle',()=>{backToWhole.hidden=!breakdown.open;});panel.appendChild(backToWhole);
    attachRecorder(panel,lessonReference(lesson,status,full));
    const footer=node('div','af-bar af-footer-actions');
    const previous=button('← Предыдущее',()=>{lessonIndex=(lessonIndex+DATA.lessons.length-1)%DATA.lessons.length;renderLesson();});previous.dataset.afPrevious='';
    const next=button('Разобрал(а), дальше →',()=>{
      if(!state.completed.includes(lesson.id)){state.completed.push(lesson.id);save();}
      lessonIndex=(lessonIndex+1)%DATA.lessons.length;renderLesson();
    },true);next.dataset.afLessonNext='';footer.append(previous,next);panel.appendChild(footer);updateLessonHeard();
  }
  function pool(){
    return DATA.numeric.filter(item=>item.kind===kind && (kind!=='time'||item.style===timeStyle) &&
      (kind!=='number'||(numberRange==='large'?item.value>1000:item.value<=Number(numberRange))));
  }
  function nextNumeric(){
    player.stop();recorder.clear();
    if(session.done>=10){renderNumericSummary();return;}
    const all=pool(),fresh=all.filter(e=>!recent.includes(e.id)),choices=fresh.length?fresh:all;
    currentTask=choices[Math.floor(Math.random()*choices.length)];
    recent.push(currentTask.id);recent=recent.slice(-8);
    taskCounted=false;usedHint=false;selectedClock='';renderNumeric();
  }
  function clockSvg(value){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 120 120');svg.setAttribute('aria-hidden','true');
    const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx','60');circle.setAttribute('cy','60');circle.setAttribute('r','55');circle.setAttribute('fill','var(--paper)');circle.setAttribute('stroke','currentColor');circle.setAttribute('stroke-width','2');svg.appendChild(circle);
    for(let n=1;n<=12;n++){const a=n*Math.PI/6,t=document.createElementNS(ns,'text');t.setAttribute('x',String(60+43*Math.sin(a)));t.setAttribute('y',String(64-43*Math.cos(a)));t.setAttribute('text-anchor','middle');t.setAttribute('font-size','10');t.setAttribute('fill','currentColor');t.textContent=String(n);svg.appendChild(t);}
    [[(value.hour%12+value.minute/60)*Math.PI/6,26,4], [value.minute*Math.PI/30,36,2.4]].forEach(hand=>{
      const line=document.createElementNS(ns,'line');line.setAttribute('x1','60');line.setAttribute('y1','60');line.setAttribute('x2',String(60+hand[1]*Math.sin(hand[0])));line.setAttribute('y2',String(60-hand[1]*Math.cos(hand[0])));line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width',String(hand[2]));line.setAttribute('stroke-linecap','round');svg.appendChild(line);
    });return svg;
  }
  function numericHeader(){
    heading('Числа, даты и время на слух','Monlam · женский голос');
    const tabs=node('div','af-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Что слушаем');
    [['number','Числа'],['date','Даты'],['time','Время']].forEach(pair=>{
      const b=button(pair[1],()=>{kind=pair[0];session={done:0,correct:0,hints:0};recent=[];nextNumeric();});b.dataset.afKind=pair[0];b.setAttribute('aria-pressed',String(kind===pair[0]));tabs.appendChild(b);
    });panel.appendChild(tabs);
    if(kind==='number'||kind==='time'){
      const label=node('label','af-field',kind==='number'?'Диапазон чисел':'Как называем время'),select=node('select');select.dataset.afNumericSetting='';
      (kind==='number'?[['100','От 0 до 100'],['1000','До 1 000'],['large','Крупные числа — до миллиарда']]:[['direct','Часы и минуты напрямую'],['relative','Четверть, половина и без четверти']]).forEach(pair=>{const o=node('option','',pair[1]);o.value=pair[0];select.appendChild(o);});
      select.value=kind==='number'?numberRange:timeStyle;select.addEventListener('change',()=>{if(kind==='number')numberRange=select.value;else timeStyle=select.value;session={done:0,correct:0,hints:0};recent=[];nextNumeric();});label.appendChild(select);
      const settings=node('details','af-numeric-settings');settings.append(node('summary','','Настроить задание'),label);panel.appendChild(settings);
    }
    const count=pool().length,stats=state.stats[kind];
    panel.appendChild(node('p','af-mini-progress','Задание '+(session.done+1)+' из 10'));
  }
  function renderNumeric(){
    panel.replaceChildren();panel.dataset.afTask=currentTask.id;numericHeader();
    panel.appendChild(node('h4','',kind==='number'?'Какое число прозвучало?':kind==='date'?'Какая дата прозвучала?':'Который час?'));
    panel.appendChild(node('p','af-note',kind==='number'?'Послушайте запись и введите число цифрами. Можно использовать обычные или тибетские цифры.':kind==='date'?'Порядок в записи: год, месяц, день. Введите дату в формате ДД.ММ.ГГГГ. Используем обычный григорианский календарь.':'Послушайте запись и выберите часы. Используем циферблат от 1 до 12, без разделения на утро и вечер.'));
    const status=node('p','af-live');status.dataset.afLive='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const play=audioButton(currentTask.bo,kind==='number'?'Послушать число':kind==='date'?'Послушать дату':'Послушать время',status,null,currentTask.id);panel.appendChild(play);settings(panel,status);
    const answer=node('div');answer.dataset.afAnswerArea='';
    const inputLabel=node('label','af-field af-answer',kind==='number'?'Число цифрами':kind==='date'?'Дата цифрами':'Время цифрами');
    const input=node('input');input.type='text';input.autocomplete='off';input.spellcheck=false;input.dataset.afAnswer='';input.maxLength=kind==='number'?20:12;
    input.inputMode=kind==='number'?'numeric':'text';input.placeholder=kind==='number'?'Например, 125':kind==='date'?'Например, 15.11.2026':'Например, 3:40';
    inputLabel.appendChild(input);
    if(kind==='time'){
      const clocks=node('div','af-clocks');clocks.dataset.afClocks='';clocks.setAttribute('role','group');clocks.setAttribute('aria-label','Выберите циферблат');
      ANSWERS.clockOptions(currentTask.value).forEach((v,i)=>{
        const label=v.hour+':'+String(v.minute).padStart(2,'0'),b=button('',()=>{
          selectedClock=label;clocks.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
        });b.classList.add('af-clock-choice');b.dataset.afClock=label;b.setAttribute('aria-label',v.hour+' ч '+v.minute+' мин');b.setAttribute('aria-pressed','false');b.append(clockSvg(v),node('small','','Вариант '+(i+1)));clocks.appendChild(b);
      });
      clocks.hidden=clockInput;inputLabel.hidden=!clockInput;
      const toggle=button(clockInput?'Выбрать циферблат':'Ввести время цифрами',()=>{
        clockInput=!clockInput;clocks.hidden=clockInput;inputLabel.hidden=!clockInput;
        toggle.textContent=clockInput?'Выбрать циферблат':'Ввести время цифрами';
        if(clockInput)input.focus();
      });toggle.dataset.afClockToggle='';toggle.classList.add('af-time-entry-toggle');answer.append(clocks,toggle);
    }
    answer.appendChild(inputLabel);panel.appendChild(answer);
    const check=button('Проверить',()=>gradeNumeric(),true);check.dataset.afCheck='';
    const feedback=node('div');feedback.dataset.afFeedback='';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();if(taskCounted){const next=panel.querySelector('[data-afNumericNext],[data-af-numeric-next]');if(next)next.click();}else gradeNumeric();}});
    panel.append(check,feedback);
    const hint=details('Подсказка: показать тибетский текст',currentTask.bo);hint.dataset.afHint='';
    hint.addEventListener('toggle',()=>{if(hint.open&&!taskCounted)usedHint=true;});panel.appendChild(hint);
    attachRecorder(panel,{key:currentTask.id,label:'Текущая запись: '+(kind==='number'?'число':kind==='date'?'дата':'время'),play:()=>player.play(currentTask.bo,play,status)});
  }
  function gradeNumeric(){
    if(taskCounted)return;
    usedHint=usedHint || panel.querySelector('[data-af-hint]').open;
    const input=panel.querySelector('[data-af-answer]'),feedback=panel.querySelector('[data-af-feedback]');
    const raw=kind==='time'&&!clockInput?selectedClock:input.value;
    const result=ANSWERS.check(kind,raw,currentTask.value);
    if(!result.valid){
      feedback.textContent=kind==='number'?'Введите целое число от 0 до 1 000 000 000.':kind==='date'?'Введите существующую дату в формате ДД.ММ.ГГГГ.':clockInput?'Введите время от 1:00 до 12:59.':'Сначала выберите один из четырёх циферблатов.';
      return;
    }
    taskCounted=true;session.done++;if(result.correct&&!usedHint)session.correct++;if(usedHint)session.hints++;
    state.stats[kind].done++;if(result.correct&&!usedHint)state.stats[kind].correct++;save();
    panel.querySelector('[data-af-check]').disabled=true;input.disabled=true;
    panel.querySelectorAll('[data-af-clock]').forEach(b=>b.disabled=true);
    feedback.className='af-feedback'+(result.correct?'':' af-wrong');feedback.replaceChildren();
    feedback.appendChild(node('h4','',result.correct?(usedHint?'Верно, с подсказкой':'Верно!'):'В записи прозвучало:'));
    feedback.appendChild(node('p','',currentTask.label));feedback.lastChild.className='af-ru';feedback.lastChild.style.fontWeight='750';feedback.lastChild.style.fontSize='25px';
    const bo=node('p','af-bo',currentTask.bo);bo.lang='bo';feedback.appendChild(bo);
    if(usedHint)feedback.appendChild(node('p','af-note','Это задание выполнено с подсказкой. В счёт самостоятельных ответов оно не входит.'));
    const next=button(session.done>=10?'Результаты занятия':'Следующее →',nextNumeric,true);next.dataset.afNumericNext='';feedback.appendChild(next);
  }
  function renderNumericSummary(){
    player.stop();recorder.clear();panel.replaceChildren();heading('Занятие завершено','Числа, даты и время на слух');
    panel.appendChild(node('h4','','Самостоятельно верно: '+session.correct+' из '+session.done));
    panel.appendChild(node('p','af-note','С подсказкой: '+session.hints+'. Можно послушать ещё одну подборку или выбрать другой раздел.'));
    panel.appendChild(button('Ещё 10 заданий',()=>{session={done:0,correct:0,hints:0};nextNumeric();},true));
    [['number','Числа'],['date','Даты'],['time','Время']].forEach(pair=>{
      const b=button(pair[1],()=>{kind=pair[0];session={done:0,correct:0,hints:0};nextNumeric();});b.dataset.afKind=pair[0];panel.appendChild(b);
    });
  }
  function installBaseRecorder(){
    if(currentMode || !recorderView)return;
    if(root.dataset.lrztpMode==='true'){recorderView.hidden=true;return;}
    const tools=root.querySelector('#tws-audio-tools');
    const candidates=[...root.querySelectorAll('#tws-exercise .tw-audio-button,#tws-feedback [data-audio-record]')];
    const target=baseRef&&baseRef.isConnected?baseRef:candidates[0];
    if(!tools || tools.hidden || !target){recorderView.hidden=true;return;}
    const key=baseKey(target);
    const label=target.getAttribute('aria-label') || target.textContent.trim() || 'Текущая запись';
    attachRecorder(tools.parentElement,{key:key,label:label,play:()=>target.click()});
  }
  function baseKey(target){
    if(!baseButtonIds.has(target))baseButtonIds.set(target,++baseButtonCounter);
    return 'base:'+baseGeneration+':'+baseButtonIds.get(target);
  }
  function mount(){
    root=document.getElementById('tw-syllable-lab');shell=root.querySelector('.tw-shell')||root;
    root.dataset.audioFeatures='monlam-practice-v1';root.dataset.audioFeatureLessons=String(DATA.lessons.length);
    root.dataset.audioFeatureSegments=String(DATA.lessons.reduce((n,l)=>n+l.segments.length,0));
    root.dataset.audioFeatureNumeric=String(DATA.numeric.length);
    launcher=node('section','af-launcher');launcher.setAttribute('aria-label','Новые аудиоупражнения');
    launcher.append(node('h3','','Слушаем, разбираем, говорим'),node('p','','Разберите фразу по смыслу или потренируйте числа, даты и время. Рядом с аудио можно записать себя и сравнить с Monlam.'));
    const grid=node('div','af-launch-grid');
    [['sentences','Разбери предложение на слух','30 предложений · целиком и по смысловым кускам'],['numeric','Числа, даты и время на слух','347 записей · ввод цифрами и циферблаты']].forEach(item=>{
      const b=node('button','af-launch');b.type='button';b.dataset.afOpen=item[0];b.setAttribute('aria-pressed','false');b.append(node('strong','',item[1]),node('span','',item[2]));b.addEventListener('click',()=>openPanel(item[0]));grid.appendChild(b);
    });launcher.appendChild(grid);
    panel=node('section','af-panel');panel.hidden=true;panel.dataset.afPanel='';panel.setAttribute('aria-label','Аудиопрактика');
    const before=root.querySelector('#tws-mix-panel');shell.insertBefore(launcher,before);shell.insertBefore(panel,before);
    makeRecorder();
    root.addEventListener('click',event=>{
      const target=event.target.closest('button');if(!target || launcher.contains(target)||panel.contains(target)||recorderView.contains(target))return;
      if(target.matches('[data-mode],#tws-new,#tws-next,#tws-check,#tws-clear,[data-dictation-kind]')){
        baseGeneration++;baseRef=null;recorder.clear();player.stop();
        if(currentMode)closePanel();
      }
      if(target.matches('.tw-audio-button,[data-audio-record]')){
        player.stop();recorder.stopPlayback();recorder.notify();
        if(['requesting','recording'].includes(recorder.state))recorder.stop();
        baseRef=target;
        const key=baseKey(target);
        changeReference({key:key,label:target.getAttribute('aria-label')||target.textContent.trim()||'Текущая запись',play:()=>target.click()});
      }
    },true);
    let queued=false;
    new MutationObserver(()=>{
      if(queued)return;queued=true;
      setTimeout(()=>{queued=false;installBaseRecorder();},50);
    }).observe(root,{subtree:true,childList:true});
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='hidden' && ['requesting','recording'].includes(recorder.state))recorder.stop();
    });
    window.addEventListener('pagehide',()=>{player.stop();recorder.dispose();});
    document.addEventListener('tws:practice-stop',()=>{player.stop();recorder.clear();});
    installBaseRecorder();
  }
  function ready(){
    const r=document.getElementById('tw-syllable-lab');
    return r && r.dataset.ready==='true' && window.TWSMonlam && window.TWSLocalRecorder && ANSWERS;
  }
  if(ready())mount();
  else {
    const observer=new MutationObserver(()=>{if(ready()){observer.disconnect();clearTimeout(timeout);mount();}});
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-ready']});
    const timeout=setTimeout(()=>{observer.disconnect();window.__TWS_AUDIO_FEATURES_V1__=false;},20000);
  }
})();

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
    const list=el('div','su-exercises');group.items.slice(0,3).forEach(item=>list.appendChild(row(item)));hub.appendChild(list);
    if(group.items.length>3){
      const more=el('details','su-more'),summary=el('summary','','Другие упражнения · '+(group.items.length-3));more.appendChild(summary);
      const extra=el('div','su-exercises');group.items.slice(3).forEach(item=>extra.appendChild(row(item)));more.appendChild(extra);hub.appendChild(more);
    }
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
