// The pinned engine ships prebundled. Its resize test also checks the border
// when no handle was hit. Opt out before both checks. Fail on dependency drift.
export function withTextGrip(source, production) {
  const hooks = production ? [
    ['rLA=(A,e,t,o,i,a,r,n)=>{', 'A', 'false'],
    ['iL=(A,e,t,o="mouse",i=_O)=>{', 'A', '{}'],
    ['IT=(A,e,t)=>{let o=cT(e);', 'A', 'null'],
  ] : [
    ['resizeTest = (element, elementsMap, appState, x, y2, zoom, pointerType, editorInterface) => {', 'element', 'false'],
    ['getTransformHandles = (element, zoom, elementsMap, pointerType = "mouse", omitSides = DEFAULT_OMIT_SIDES) => {', 'element', '{}'],
    ['var getTextAutoResizeHandle = (textElement, zoomValue, formFactor) => {', 'textElement', 'null'],
  ];
  for (const [prefix, el, result] of hooks) {
    if (source.split(prefix).length !== 2) throw new Error('Review text grip hook: '+prefix);
    const guard = `if(${el}.type==="text"&&!${el}.containerId&&!${el}.groupIds?.length&&!${el}.angle)return ${result};`;
    source = source.replace(prefix, () => prefix + guard);
  }
  return source;
}