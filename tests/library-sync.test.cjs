const {test}=require('node:test');const assert=require('node:assert/strict');
const {reconcile,pending}=require('../site/library-sync.js');const D=require('../site/domain.js');
const e={id:'manual:one',kind:'manga',title:'One',progress:10,status:'reading',manualTotal:null,muId:null,updated:1};
const doc=(...entries)=>({entries});
test('three missing additions merge with an independent progress update',()=>{
  const local=doc(e,...[1,2,3].map(n=>({...e,id:'manual:extra'+n})));
  const remote=doc({...e,progress:12,updated:2});const result=reconcile(doc(e),local,remote);
  assert.equal(result.document.entries.length,4);assert.equal(result.document.entries[0].progress,12);assert(!result.combined);D.validate(result.document);
});
test('simultaneous advances combine without blocking the rest of the library',()=>{
  const result=reconcile(doc(e),doc({...e,progress:14,updated:4}),doc({...e,progress:12,updated:5}));
  assert.equal(result.document.entries[0].progress,14);assert(result.combined);
});
test('unilateral correction backwards and deletion are honored',()=>{
  assert.equal(reconcile(doc(e),doc({...e,progress:5,updated:2}),doc(e)).document.entries[0].progress,5);
  assert.equal(reconcile(doc(e),doc(),doc(e)).document.entries.length,0);
});
test('edit concurrent with deletion is retained for recovery, not silently erased',()=>{
  const result=reconcile(doc(e),doc(),doc({...e,progress:11,updated:2}));assert.equal(result.document.entries[0].progress,11);assert(result.combined);
});
test('different fields on one title merge; same field uses last modification',()=>{
  const result=reconcile(doc(e),doc({...e,readingUrl:'https://example.com',updated:2}),doc({...e,progress:13,updated:3}));
  assert.equal(result.document.entries[0].readingUrl,'https://example.com');assert.equal(result.document.entries[0].progress,13);assert(!result.combined);
  assert.equal(reconcile(doc(e),doc({...e,status:'paused',updated:4}),doc({...e,status:'completed',updated:5})).document.entries[0].status,'completed');
});
test('pending count survives serialization and includes deletions and links',()=>{
  const local={entries:[{...e,progress:11}],readingLinks:[{id:'link',title:'Read',url:'https://example.com'}]};
  assert.equal(pending(doc(e),JSON.parse(JSON.stringify(local))),2);assert.equal(pending(doc(e),doc()),1);
});
