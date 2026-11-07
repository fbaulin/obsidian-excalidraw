// @ts-nocheck
/** Parse mathematical spans without changing the editable source text. */
export function splitMath(input) {
  const result=[]; let text='';
  function flush(){if(text){result.push({type:'text',value:text});text='';}}
  for(let i=0;i<input.length;) {
    if(input[i]==='\\' && input[i+1]==='$'){text+='$';i+=2;continue;}
    if(input[i]!=='$'){text+=input[i++];continue;}
    const double=input[i+1]==='$', marker=double?'$$':'$', len=marker.length;
    const start=i+len;let end=-1;
    for(let j=start;j<input.length;j++) {
      if(input[j]==='\\' && input[j+1]==='$'){j++;continue;}
      if(input.slice(j,j+len)===marker){end=j;break;}
      if(!double&&input[j]==='\n') break;
    }
    if(end<0 || !input.slice(start,end).trim()){text+=marker;i+=len;continue;}
    flush();result.push({type:'math',value:input.slice(start,end),display:double});i=end+len;
  }
  flush();return result;
}
/** For the draw.io mxGraph text cell, normalize inline maths into supported delimiters. */
export function drawioMathText(source) {
  return splitMath(source).map(p=>p.type==='math'?(p.display?'$$'+p.value+'$$':'\\('+p.value+'\\)'):p.value).join('');
}
