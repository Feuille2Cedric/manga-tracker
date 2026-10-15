const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../site/domain.js');
const entry={id:'manga:42',kind:'manga',title:'Dragon Ball',progress:10,status:'reading',manualTotal:null,muId:null,updated:1};
test('unknown totals remain unknown; release feed and override precedence',()=>{
  assert.equal(D.available(entry,{total:null},null),null);
  assert.equal(D.available(entry,{total:null},{latest:120}),120);
  assert.equal(D.available(entry,{total:519},{latest:520}),519);
  assert.equal(D.available({...entry,manualTotal:600},{total:519},{latest:520}),600);
});
test('airing anime uses aired episodes, never future announced total',()=>{
  assert.equal(D.available({...entry,kind:'anime'},{total:24,ongoing:true,available:8}),8);
  assert.equal(D.available({...entry,kind:'anime'},{total:24,ongoing:true}),null);
  assert.equal(D.available({...entry,kind:'anime'},{total:24,ongoing:false}),24);
});
test('reject corrupted, duplicate, negative and ambiguous imports',()=>{
  D.validate({entries:[entry]});
  for(const e of [{...entry,progress:-1},{...entry,progress:1.5},{...entry,kind:'anime'},{...entry,muId:'https://evil.test'},{...entry,title:''},{...entry,manualTotal:0}])assert.throws(()=>D.validate({entries:[e]}));
  assert.throws(()=>D.validate({entries:[entry,entry]}));
});
test('Dragon Ball trophy requires canonical Kitsu manga marked complete',()=>{
  const trophy=D.trophies.find(t=>t.id==='dragon');
  assert.equal(trophy.value([{...entry,id:'manga:111',progress:518}]),0);
  assert.equal(trophy.value([{...entry,id:'manga:111',progress:520,status:'completed'}]),1);
  assert.equal(trophy.value([{...entry,id:'manual:dragon-ball',progress:520,status:'completed'}]),0);
});
