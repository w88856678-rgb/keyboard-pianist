import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pinyin } from 'pinyin-pro';
import { Converter } from 'opencc-js';

// The source rows are tied to pinned Git blobs. OCR navigation, footer symbols,
// keys and alternate endings are corrected explicitly below, never inferred at runtime.
const sources = JSON.parse(await readFile(new URL('./scores/mainstream-source.json', import.meta.url), 'utf8'));
const revision = 'd270cf5f912225d8e9ac016e8a7a2a0299204f56';
const simplify = Converter({ from: 'tw', to: 'cn' });
const scale = [0,0,2,4,5,7,9,11];
const report = [];
for (const source of sources) {
  const image = await readFile(new URL(`../public${source.scoreImage}`, import.meta.url));
  if (createHash('sha1').update(`blob ${image.length}\0`).update(image).digest('hex') !== source.sourceBlob)
    throw new Error(`Source changed: ${source.title}`);
  const rows = structuredClone(source.rows);
  const patch = (r,i,changes) => Object.assign(rows[r][i], changes);
  const word = (r,i,...lyrics) => patch(r,i,{lyrics});
  const octave = (r,indices,value) => indices.forEach(i=>patch(r,i,{octave:value}));
  const R = (r,start=0,end=rows[r].length) => rows[r].slice(start,end).map(n=>structuredClone(n));
  const N = (degree,duration,octave=0,lyric='') => ({degree,duration,octave,lyrics:[lyric]});
  const notation = text => text.trim().split(/\s+/).map(token=> {
    const [name,duration] = token.split(':');
    return {...N(Number(name.replace(/[^0-7]/g,'')), Number(duration), name.includes('h')?1:name.includes('l')?-1:0),
      ...(name.includes('#')?{alter:1}:{})};
  });
  const clean = text => simplify(String(text || '')).replaceAll('幺','么').replace(/[^\p{Script=Han}a-zA-Z]/gu,'');
  let time=0, last, previous, pendingLine=false;
  const events=[], sections=[];
  const pitch = n => source.baseMidi + (n.transpose || 0) + scale[n.degree] + 12*(n.octave||0)+(n.alter||0);
  const sounds = n => {
    if (!n.degree) return [];
    const grace = (n.grace||[]).map(([degree,octave])=>({degree,octave,transpose:n.transpose}));
    const d=Math.min(.0625,n.duration/(grace.length+1));
    return [...grace.map((g,i)=>({midi:pitch(g),offset:i*d,duration:d})),
      {midi:pitch(n),offset:grace.length*d,duration:n.duration-grace.length*d}];
  };
  function section(label, entries, lane=0, instrumental=false, fallback=false) {
    const start=time, startIndex=events.length;
    let current, passage;
    previous=null;
    if (instrumental) passage={lyric:'',initial:'A',kind:'instrumental',section:label,auto:false,inferred:false,start,duration:0,notes:[]};
    for (const entry of entries) {
      const raw=entry.lyrics?.[lane] || (fallback?entry.lyrics?.[0]:'') || '';
      const lyric=instrumental?'':clean(raw);
      if (lyric && !entry.degree) throw new Error(`${source.title} lyric on rest: ${entry.ref} ${lyric}`);
      if (lyric) {
        current={lyric,initial:'A',kind:'vocal',section:label,start:time,duration:entry.duration,notes:[],
          ...(!current||pendingLine?{lineStart:true}:{})};
        pendingLine=false;
        events.push(current);
      }
      if (entry.degree) {
        const target=instrumental?passage:current;
        // A tie crossing a section boundary belongs to the preceding sung syllable.
        const owner=target || last;
        if (!owner) throw new Error(`${source.title} unattached note at ${entry.ref}`);
        if (!lyric && entry.tieStop && previous?.entry.tieStart && !entry.grace?.length && previous.note.midi===pitch(entry)) {
          previous.note.duration+=entry.duration;
          previous.entry=entry;
        } else {
          for (const note of sounds(entry)) {
            const added={...note,offset:time-owner.start+note.offset};
            owner.notes.push(added);previous={note:added,entry};
          }
        }
        owner.duration=time+entry.duration-owner.start;
      }
      time+=entry.duration;
      if (!instrumental && /[，。！？；,.!?;]$/.test(raw)) pendingLine=true;
    }
    if (instrumental && passage.notes.length) {passage.duration=time-start;events.push(passage);}
    if (events.length>startIndex) sections.push({label,start:events[startIndex].start,eventIndex:startIndex});
    last=events.at(-1);
    pendingLine=true;
  }
  const V = (label,entries,lane=0,fallback=false) => section(label,entries,lane,false,fallback);
  const I = (label,entries) => section(label,entries,0,true);
  const gap = entries => { time+=entries.reduce((sum,n)=>sum+n.duration,0); };
  let edition='', phraseTexts=[];
  switch(source.id) {
    case 'balloon-full': {
      I('前奏',[...R(0,1),...R(1),...R(2,0,3)]);
      V('主歌',[...R(2,3),...R(3),...R(4,0,20)]);
      V('过渡',[...R(4,20),...R(5),...R(6),...R(7,0,9)]);
      V('副歌',[...R(7,9),...R(8),...R(9,0,7)]);
      I('尾奏',[...R(9,7),...R(10,0,18)]);
      phraseTexts=['花店玫瑰名字写错谁','营造浪漫的约会'];
      edition='B 调、4/4。按这一页简谱从前奏到尾奏完整录入；谱面未标出的原唱重复段不另行补写。';
      break;
    }
    case 'lucky-full': {
      patch(10,2,{duration:.25}); patch(10,24,{duration:.75});
      // Last run reaches the next octave at the tonic.
      octave(11,[32,33,34],2);
      I('前奏',R(0,0,22));
      V('开篇',[...R(0,22),...R(1),...R(2,0,15)]);
      for (let lane=0;lane<2;lane++) {
        V(`主歌 ${lane+1}`,[...R(2,15),...R(3),...R(4,0,8)],lane);
        V(`过渡 ${lane+1}`,[...R(4,8),...R(5),...R(6,0,8)],lane);
        V(`副歌 ${lane+1}`,[...R(6,8),...R(7),...R(8),...R(9),...R(10)],lane);
        I(lane?'尾奏':'间奏',lane?[...R(11),...R(12,0,12)]:R(11));
      }
      edition='孙世彦制谱，F 调、4/4，原谱 80 BPM。展开两遍歌词与反复；第一遍器乐为间奏，第二遍连接结尾。剔除页脚联络数字。';
      break;
    }
    case 'later-full': {
      octave(0,[7,8,9,10,18],1);
      octave(2,[0,19],1);octave(5,[6],1);octave(6,[12,13,14,16],1);
      octave(9,[11],1);octave(10,[8,9,11],1);octave(12,[8,9],1);octave(13,[16],1);
      octave(15,[5],1);octave(17,[2,4,7,8],1);octave(18,[10],2);
      patch(18,12,{octave:1});patch(18,4,{alter:0});patch(18,9,{alter:0});patch(18,11,{alter:0});patch(18,13,{alter:0});
      word(3,10,'瓣');word(3,19,'百');word(5,18,'夏');word(10,14,'顽');
      word(11,6,'如');word(11,7,'何');word(11,8,'回');word(11,9,'忆');word(11,10,'我');word(11,11,'');
      word(13,7,'惜');word(19,8,'来');
      // Printed introduction has a high 6 omitted by recognition; the vocal pickup is 3-2-1, not footer noise.
      I('前奏',[...R(0,1,13).filter(n=>n.degree),N(6,2,1),...R(0,13,21),...notation('3h:0.16666666666666666 2h:2'),N(0,3)]);
      V('开篇',[N(3,.5,1,'后'),N(2,.25,1),N(1,.25,1),...R(1),...R(2),...R(3,0,4)]);
      V('主歌 1',[...R(3,4),...R(4),...R(5),...R(6),...R(7,0,4)]);
      V('主歌 2',[...R(7,4),...R(8),...R(9),...R(10),...R(11,0,4)]);
      const bridge=[...R(11,4),...R(12,0,13)];
      const chorus=[...R(12,13),...R(13),...R(14)];
      V('桥段 1',bridge);V('副歌 1',chorus);
      I('间奏',[N(0,10.75),...R(15),...R(16),N(0,11.5)]);
      V('桥段 2',bridge);V('副歌 2',chorus);
      I('器乐独奏',[...R(17,2),...R(18,0,23)]);
      V('桥段 3',bridge);V('副歌 3',chorus);
      // Final two bracketed vocal cadences are melismas on the last 在.
      V('收尾延音',R(18,23).map(n=>({...n,lyrics:[]})));
      V('尾声',R(19));
      edition='C 调、4/4。按谱面的两处反复收束分为桥段、副歌、间奏及器乐独奏，最后接尾声。谱尾括号内的回唱音型并入末字延音；本版按纸面编排，未复刻录音的全部细节。';
      phraseTexts=['后来我总算学会了如何去爱','可惜你早已远去消失在人海','后来终于在眼泪中明白','有些人一旦错过就不在','栀子花白花瓣','落在我蓝色百褶裙上','爱你你轻声说','我低下头闻见一阵芬芳','那个永恒的夜晚','十七岁仲夏你吻我的那个夜晚','让我往后的时光','每当有感叹总想起当天的星光','那时候的爱情','为什么就能那样简单','而又是为什么人年少时','一定要让深爱的人受伤','在这相似的深夜里','你是否一样也在静静追悔感伤','如果当时我们能不那么顽强','现在也不那么遗憾','你都如何回忆我','带着笑或是很沉默','这些年来有没有人能让你不寂寞','永远不会再重来','有一个男孩爱着那个女孩'];
      break;
    }
    case 'ten-years-full': {
      word(0,18,'颤');
      for(const [r,i,duration] of [[1,0,.75],[2,4,.75],[2,12,.75],[4,6,2],[4,12,.75],[4,24,.75],[4,26,.25],[4,28,.25],[4,29,.25],[6,0,.75],[6,6,.75],[7,1,.75],[7,11,1.5],[9,0,.75],[9,7,.75]])patch(r,i,{duration});
      patch(4,25,{degree:0,duration:0,lyrics:[]});patch(4,26,{grace:[[3,0]],lyrics:['我']});
      patch(1,19,{octave:-1});patch(3,20,{octave:-1});patch(3,21,{octave:-1});
      octave(4,[25],0);octave(6,[13,14],0);patch(9,6,{octave:-1});
      gap(R(0,0,10));
      V('主歌 1',[...R(0,10),...R(1,0,23)]);
      V('主歌 2',[...R(1,23),...R(2),...R(3,0,6)]);
      const bridge=[...R(3,6),...R(4,0,8)];
      const chorus=[...R(4,8),...R(5),...R(6),...R(7,0,15)];
      V('过渡 1',bridge);V('副歌 1',chorus);
      gap([...R(7,15),...R(8,0,4)]);
      V('过渡 2',bridge);V('副歌 2',[...chorus.slice(0,-1),{...R(8,4,5)[0],lyrics:['友']}]);
      V('尾声',[...R(8,5),...R(9)]);
      edition='A 调、2/4。展开从「怀抱既然不能逗留」开始的反复与第二结尾，保留结尾歌词及原谱休止。谱面开头仅为休止，没有另造前奏。';
      phraseTexts=['如果那两个字没有颤抖','我不会发现我难受','怎么说出口','也不过是分手','如果对于明天没有要求','牵牵手就像旅游','成千上万个门口','总有一个人要先走','怀抱既然不能逗留','何不在离开的时候','一边享受一边泪流','十年之前我不认识你你不属于我','我们还是一样','陪在一个陌生人左右','走过渐渐熟悉的街头','十年之后我们是朋友还可以问候','只是那种温柔','再也找不到拥抱的理由','情人最后难免沦为朋友','直到和你做了多年朋友','才明白我的眼泪','不是为你而流','也为别人而流'];
      break;
    }
    case 'long-time-full': {
      patch(0,5,{octave:0});patch(1,24,{octave:0});
      for(const [r,i,duration] of [[1,6,.25],[1,7,.25],[3,9,.25],[4,10,.25],[8,8,1.5]])patch(r,i,{duration});
      patch(5,3,{degree:0,duration:0,lyrics:[]});
      for(const r of [4,6])patch(r,7,{alter:0,grace:[[3,0]]});
      rows[0].splice(9,0,N(1,1));
      patch(6,21,{octave:0});patch(7,13,{octave:0});patch(7,2,{alter:0});
      rows[10].forEach(n=>n.lyrics=[]);word(10,1,'见。');
      octave(10,[3,4,5,6,7,8,9,10,11,12],1);
      V('主歌 1',[...R(0),...R(1,0,18)]);
      const verse=[...R(1,18),...R(2),...R(3,0,9)];
      const chorus=[...R(3,9),...R(4),...R(5),...R(6),...R(7,0,19)];
      V('主歌 2',verse);V('副歌 1',[...chorus,...R(7,20,22)]);
      I('间奏',[...R(7,23),...R(8,0,19)]);
      V('主歌 3',verse);V('副歌 2',[...chorus,...R(10,1,2)]);
      I('尾奏',[...R(9,1),...R(10,2,16)]);
      edition='蔡少亮制谱，C 调、4/4。展开主歌反复、第一及第二结尾；页末第二结尾与尾奏上行按实际演奏顺序衔接，剔除页脚误识别文字。';
      break;
    }
    case 'rest-of-life-full': {
      patch(1,1,{degree:5,octave:-1,duration:.25});patch(1,8,{degree:5});
      patch(1,7,{duration:.25});patch(1,8,{duration:.25});
      for (const i of [1,2,3,4])patch(2,i,{duration:.5});
      patch(6,2,{duration:.25});patch(6,3,{duration:.25});
      const verse=lane=>[...R(0),...R(1).map((n,i)=>[10,11].includes(i)?{...n,degree:lane?3:0,octave:0,lyrics:lane?n.lyrics:[]}:n),...R(2)];
      V('主歌 1',verse(0));V('副歌 1',[...R(3),...R(4),...R(5),...R(6)]);
      V('主歌 2',verse(1),1);V('副歌 2',[...R(3),...R(4),...R(5),...R(6)],1);
      edition='孙世彦制谱，降 D 调、4/4，原谱 64 BPM。展开两遍歌词。第二遍「着、迷」印在休止位置，本练习版沿用前字 3 的音高补成两个可按字；其余保持主行旋律。此谱没有独立器乐段。';
      break;
    }
    case 'chaser-full': {
      // A complete printed system before recognized row 0 was missed by OMR.
      const intro=notation('1h:0.0625 2h:0.0625 5h:0.375 1h:0.5 7:0.5 7:2 0:1 0:0.5 7:0.5 6:0.5 7:0.5 1h:0.5 7:0.5 7:2 0:1 0:0.5 6:0.25 7:0.25 1h:0.5 7:0.25 3:0.25 3:0.5 5:0.5 5:2 2:0.5 1:0.25 2:0.25 2:0.5 5:0.5 3:1 6:0.5 7:0.5');
      intro[4].tieStart=true;intro[5].tieStop=true;
      word(6,10,'如','如');word(6,11,'果','果');
      word(2,3,'我','也');word(2,4,'是','许');word(2,5,'追','你');
      word(2,31,'我');word(2,32,'可');word(2,33,'以');patch(2,30,{degree:0,duration:.5});
      I('前奏',[...intro,...R(0,0,9)]);
      const first=[...R(0,9),...R(1),...R(2,0,27)];
      const pickup=R(2,30);
      const common=[...R(3),...R(4)];
      V('主歌 1',first);
      V('副歌 1',[...pickup,...common,...R(5,0,15)]);
      I('间奏',[...R(5,15),...R(6,0,10)]);
      V('主歌 2',[...R(6,10,12),...R(0,11),...R(1),...R(2,0,27)],1);
      V('副歌 2',[...pickup,...common,...R(6,12,31)]);
      gap(R(7,0,7).filter(n=>n.ref[1]===6));
      const toC = entries=>entries.map(n=>({...n,transpose:1}));
      V('升调副歌',[...toC(R(7,7,10)),...toC(common),...toC(R(7,10))]);
      phraseTexts=['也许你不会为我停留','那就让我站在你的背后'];
      edition='桃李醉春风记谱，B 调、4/4，结尾转 C 调，含短暂变拍。展开两段主歌、第一及第二房和 D.S. 升调副歌，补入识谱遗漏的第一行前奏；采用谱面主行旋律，括号中的可选变奏及注明省略的间奏不另行扩写。';
      break;
    }
    case 'time-thief-full': {
      word(4,2,'时');word(4,3,'有');
      for(let i=18;i<26;i++)patch(8,i,{tieStart:false,tieStop:false});
      I('前奏',R(0,1,32));
      const verse=[...R(1),...R(2),...R(3,0,7)];
      const chorus=[...R(3,7),...R(4),...R(5)];
      V('主歌 1',[...R(0,32),...verse]);
      V('副歌 1',[...chorus,...R(6,0,19)]);
      I('间奏',[...R(6,19),...R(7,0,3)]);
      V('主歌 2',[...R(7,3,5),...verse]);
      V('副歌 2',[...chorus,...R(7,5,23)]);
      V('副歌 3',[...R(7,28),...R(3,13),...R(4),...R(5),...R(8,0,18)]);
      I('尾奏',[...R(8,18),...R(9)]);
      edition='不才演唱版，降 A 调、4/4，末段局部变为 2/4。展开两个结尾与 D.S. 回唱，保留前奏、谱中间奏及尾奏；「间奏省略」处没有另外补写，尾奏连桁按重复音弹奏。';
      break;
    }
    case 'paper-short-full': {
      patch(2,3,{octave:-1});
      V('主歌',[...R(0),...R(1),...R(2,0,11)]);
      for(let lane=0;lane<2;lane++) {
        V(`副歌 A${lane+1}`,[...R(2,11),...R(3),...R(4),...R(5,0,12)],lane,true);
        V(`副歌 B${lane+1}`,[...R(5,12),...R(6),...R(7),...R(8)],lane);
      }
      V('尾声',R(9));
      edition='D 调、4/4，原谱 100 BPM。按谱从「我真的好想你」起反复两遍，再接末行尾声。此谱没有独立前奏或器乐间奏，「唔」作为哼唱旋律保留。';
      break;
    }
    case 'warm-full': {
      word(7,21,'都','都');word(7,22,'可','可');word(7,23,'以','以');
      word(2,8,'摇','满');word(4,18,'汤','歌');word(10,17,'望');
      patch(0,0,{alter:0});
      I('前奏',[...R(0),...R(1,0,11)]);
      V('主歌 1',[...R(1,12),...R(2),...R(3),...R(4),...R(5,0,15)]);
      V('副歌 1',[...R(5,15),...R(6),...R(7,0,21)]);
      V('主歌 2',[...R(7,21),...R(1,16),...R(2),...R(3),...R(4),...R(5,0,15)],1);
      V('副歌 2',[...R(5,15),...R(6),...R(7,0,17),...R(8,0,4)],1,true);
      V('尾声副歌',[...R(8,4),...R(9),...R(10)]);
      edition='降 B 调、4/4。展开两遍主歌与副歌、不同结尾及最后一次变化歌词副歌；保留开头器乐，不将反复房号当音符。';
      phraseTexts=['都可以随便的你说的我都愿意去','小火车摇动的旋律','都可以是真的你说的我都会相信','因为我完全信任你','细腻的喜欢毛毯般的厚重感','晒过太阳熟悉的安全感','分享热汤我们两支汤匙一个碗','左心房暖暖的好饱满','我想说其实你很好','你自己却不知道','真心的对我好不要求回报','爱一个人希望他过更好','打从心里暖暖的','你比自己更重要','回忆里满足的旋律','细腻的喜欢你手掌的厚实感','什么困难都觉得有希望','我哼着歌你自然的就接下一段','我知道暖暖就在胸膛','从来都很低调自信心不高','我也希望变更好'];
      break;
    }
  }
  // Contextual pinyin avoids treating polyphonic lyrics as isolated characters.
  const vocals=events.filter(e=>e.kind==='vocal');
  const initials=pinyin(vocals.map(e=>e.lyric).join(''),{pattern:'first',toneType:'none',type:'array',nonZh:'consecutive'});
  if(initials.length!==vocals.length)throw new Error(`Unexpected lyric token count: ${source.title}`);
  vocals.forEach((e,i)=>e.initial=initials[i].slice(0,1).toUpperCase());
  // Long lines with no punctuation in older scans use explicit audited phrase text.
  const text=vocals.map(e=>e.lyric).join('');
  const starts=new Set();
  for(const phrase of phraseTexts) {
    let at=0,index;
    while((index=text.indexOf(phrase,at))!==-1) {starts.add(index);at=index+phrase.length;}
  }
  let offset=0;
  for(const e of vocals) {if(starts.has(offset))e.lineStart=true;offset+=e.lyric.length;}
  const song={id:source.id,title:source.title,artist:source.artist,bpm:source.bpm,tag:'全曲简谱',
    source:`Flame-shi/musical-notation · ${source.sourcePath} · ${source.key} 调旋律简谱`,
    sourcePath:source.sourcePath,sourceBlob:source.sourceBlob,
    sourceUrl:`https://github.com/Flame-shi/musical-notation/blob/${revision}/${source.sourcePath.split('/').map(encodeURIComponent).join('/')}`,
    scoreImage:source.scoreImage,key:source.key,beatsPerMeasure:source.beatsPerMeasure,durationBeats:time,
    edition:`${edition} 这是完整谱面编排的单旋律练习版，没有双手伴奏；琴房打开时统一为可调整的 90 BPM。`,sections,events};
  for(const e of events) {
    if(!e.notes.length||!/^[A-Z]$/.test(e.initial))throw new Error(`Invalid event: ${source.title} ${e.lyric}`);
    for(const n of e.notes)if(n.offset<0||n.duration<=0||n.offset+n.duration>e.duration+1e-7||n.midi<21||n.midi>108)
      throw new Error(`Invalid note: ${source.title} ${JSON.stringify(e)}`);
  }
  const dest=new URL(`../src/data/${source.id}.json`,import.meta.url);
  await writeFile(dest,JSON.stringify(song)+'\n');
  await copyFile(dest,new URL(`../public/songs/${source.id}.json`,import.meta.url));
  report.push({id:source.id,title:source.title,beats:time,lyrics:vocals.length,notes:events.flatMap(e=>e.notes).length,
    sections:sections.map((s,i)=>({label:s.label,text:events.slice(s.eventIndex,sections[i+1]?.eventIndex).map(e=>`${e.lineStart?'\n':''}${e.lyric}`).join('')}))});
}
await writeFile(new URL('./scores/mainstream-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(report.map(s=>`${s.title}: ${s.lyrics} 歌词键，${s.notes} 音符，${s.sections.length} 段`).join('\n'));
