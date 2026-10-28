import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";

export const emailDetailLabels:Record<string,string>={employee_name:"Participant name",training_name:"Training name",training_date:"Training date",training_time:"Training time",venue:"Venue",trainer:"Trainer"};
export type InlineEmailHandle={insertDetail:(key:string)=>void};
const readText=(node:Node):string=>{
 if(node.nodeType===Node.TEXT_NODE)return node.textContent||"";
 if(node instanceof HTMLElement&&node.dataset.emailDetail)return `{{${node.dataset.emailDetail}}}`;
 if(node instanceof HTMLBRElement)return "\n";
 if(node instanceof HTMLElement&&["DIV","P"].includes(node.tagName)&&node.childNodes.length===1&&node.firstChild instanceof HTMLBRElement)return "";
 return Array.from(node.childNodes).map((child,index)=>`${index>0&&child instanceof HTMLElement&&["DIV","P"].includes(child.tagName)?"\n":""}${readText(child)}`).join("");
};
function detailChip(key:string){const span=document.createElement("span");span.dataset.emailDetail=key;span.contentEditable="false";span.className="email-detail-chip";span.textContent=emailDetailLabels[key]||key;return span;}
function fillText(element:HTMLElement,value:string){
 element.replaceChildren();let offset=0;
 for(const match of value.matchAll(/\{\{([a-z_]+)\}\}/g)){
  element.append(document.createTextNode(value.slice(offset,match.index)));
  element.append(detailChip(match[1]));offset=match.index!+match[0].length;
 }
 element.append(document.createTextNode(value.slice(offset)));
}
export const InlineEmailText=forwardRef<InlineEmailHandle,{value:string;onChange:(value:string)=>void;onFocus:()=>void;label:string;className?:string;multiline?:boolean;disabled:boolean}>(({value,onChange,onFocus,label,className="",multiline=false,disabled},handle)=>{
 const element=useRef<HTMLDivElement>(null),caret=useRef<Range|null>(null);
 const remember=()=>{const selection=window.getSelection();if(selection?.rangeCount&&element.current?.contains(selection.anchorNode))caret.current=selection.getRangeAt(0).cloneRange();};
 const changed=()=>{if(element.current)onChange(readText(element.current));remember();};
 useLayoutEffect(()=>{const node=element.current;if(node&&readText(node)!==value)fillText(node,value);},[value]);
 const insert=(value:string,key?:string)=>{
  const node=element.current;if(!node||disabled)return;node.focus();const selection=window.getSelection();if(!selection)return;
  const range=caret.current&&node.contains(caret.current.commonAncestorContainer)?caret.current.cloneRange():document.createRange();
  if(!caret.current||!node.contains(range.commonAncestorContainer)){range.selectNodeContents(node);range.collapse(false);}
  range.deleteContents();const addition=key?detailChip(key):document.createTextNode(value);range.insertNode(addition);range.setStartAfter(addition);range.collapse(true);selection.removeAllRanges();selection.addRange(range);caret.current=range.cloneRange();changed();
 };
 useImperativeHandle(handle,()=>({insertDetail:key=>insert("",key)}));
 return <div ref={element} role="textbox" aria-label={label} aria-multiline={multiline} aria-disabled={disabled} contentEditable={!disabled} suppressContentEditableWarning className={`inline-email-text ${className}`} spellCheck onFocus={onFocus} onInput={changed} onBlur={remember} onKeyUp={remember} onMouseUp={remember} onKeyDown={e=>{if(!multiline&&e.key==="Enter")e.preventDefault();}} onPaste={e=>{e.preventDefault();remember();const text=e.clipboardData.getData("text/plain");insert(multiline?text:text.replace(/[\r\n]+/g," "));}}/>;
});
