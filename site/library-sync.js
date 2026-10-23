/* Three-way reconciliation of saved library entries. Draft forms stay in the UI. */
(function(root){
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const canonical=value=>JSON.stringify(value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
  function reconcile(base,local,remote){
    let combined=false;
    const newer=(a,b)=>(Number(a?.updated)||0)>(Number(b?.updated)||0)?a:(Number(a?.updated)||0)<(Number(b?.updated)||0)?b:canonical(a)>canonical(b)?a:b;
    function record(b,l,r){
      if(equal(l,r))return l;
      if(equal(b,l))return r;
      if(equal(b,r))return l;
      // A concurrent edit survives a deletion. A normal deletion still propagates.
      if(!l||!r){combined=true;return l||r;}
      const preferred=newer(l,r),out={};
      for(const key of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){
        const bv=b?.[key],lv=l[key],rv=r[key];let value;
        if(equal(lv,rv))value=lv;
        else if(equal(bv,lv))value=rv;
        else if(equal(bv,rv))value=lv;
        else if(key==='updated')value=Math.max(Number(lv)||0,Number(rv)||0);
        else if(key==='progress'&&Number.isSafeInteger(lv)&&Number.isSafeInteger(rv)&&lv>=(bv??0)&&rv>=(bv??0)){combined=true;value=Math.max(lv,rv);}
        else if(!b&&(lv==null||lv===''))value=rv;
        else if(!b&&(rv==null||rv===''))value=lv;
        else {combined=true;value=preferred[key];}
        if(value!==undefined)out[key]=value;
      }
      return out;
    }
    function collection(b=[],l=[],r=[]){
      const bm=new Map(b.map(e=>[e.id,e])),lm=new Map(l.map(e=>[e.id,e])),rm=new Map(r.map(e=>[e.id,e]));
      return [...new Set([...rm.keys(),...lm.keys()])].map(id=>record(bm.get(id),lm.get(id),rm.get(id))).filter(Boolean);
    }
    const rest=doc=>Object.fromEntries(Object.entries(doc).filter(([key])=>!['entries','readingLinks'].includes(key)));
    const document={...record(rest(base),rest(local),rest(remote)),entries:collection(base.entries,local.entries,remote.entries)};
    if(base.readingLinks||local.readingLinks||remote.readingLinks)document.readingLinks=collection(base.readingLinks,local.readingLinks,remote.readingLinks);
    return {document:structuredClone(document),combined};
  }
  function pending(base,local){
    let count=0;
    for(const key of ['entries','readingLinks']){
      const a=new Map((base?.[key]||[]).map(e=>[e.id,e])),b=new Map((local?.[key]||[]).map(e=>[e.id,e]));
      for(const id of new Set([...a.keys(),...b.keys()]))if(!equal(a.get(id),b.get(id)))count++;
    }
    return count;
  }
  root.TsugiLibrarySync={reconcile,pending};
  if(typeof module!=='undefined')module.exports=root.TsugiLibrarySync;
})(typeof window!=='undefined'?window:globalThis);
