'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SITE_LANGUAGE_PICKER_CSS, siteLanguagePickerScript } = require('../site-language-picker.cjs');

function mockDocument() {
  const eventMap = () => new Map();
  let brand;
  let ticks;
  let nativeChanges = 0;

  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = []; this.parentNode = null;
      this.attributes = {}; this.dataset = {};
      this.events = eventMap(); this.style = {};
      this.hidden = false; this.textContent = '';
    }
    get isConnected() {
      return this === body || Boolean(this.parentNode && this.parentNode.isConnected);
    }
    getAttribute(name) { return this.attributes[name] || null; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, cb) {
      const callbacks = this.events.get(name) || [];
      callbacks.push(cb); this.events.set(name, callbacks);
    }
    dispatchEvent(event) {
      for (const cb of this.events.get(event.type) || []) cb(event);
      return true;
    }
    click() { this.dispatchEvent({type:'click'}); }
    focus() { this.focused = true; }
    appendChild(child) {
      if (child.parentNode) child.remove();
      child.parentNode = this; this.children.push(child); return child;
    }
    append(...children) { for (const child of children) this.appendChild(child); }
    insertBefore(child, before) {
      if (child.parentNode) child.remove();
      const at = this.children.indexOf(before);
      if (at < 0) throw new Error('Unknown sibling');
      child.parentNode = this; this.children.splice(at,0,child);
      return child;
    }
    replaceChildren(...children) {
      for (const child of this.children) child.parentNode = null;
      this.children = [];
      this.append(...children);
    }
    remove() {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter(x => x !== this);
        this.parentNode = null;
      }
    }
    querySelectorAll(tag) {
      const found = [];
      for (const child of this.children) {
        if (child.tagName.toLowerCase() === tag) found.push(child);
        found.push(...child.querySelectorAll(tag));
      }
      return found;
    }
    contains(node) {
      return this === node || this.children.some(child => child.contains(node));
    }
  }
  class Select extends Element {
    constructor(code = 'ru') {
      super('select');
      this._value = code;
      this.options = ['uk','en','ru','pl'].map(value => ({value}));
      this.setAttribute('title','Мова');
      this.setAttribute('aria-label','Мова');
    }
    get value() { return this._value; }
    set value(next) { this._value = next; }
    dispatchEvent(event) {
      if (event.type === 'change') nativeChanges++;
      return super.dispatchEvent(event);
    }
  }
  const body = new Element('body');
  function newHeader(code='ru') {
    const next = new Element('div');
    const select = new Select(code);
    next.appendChild(select);
    body.appendChild(next);
    brand = next;
    return { next, select };
  }
  const first = newHeader();
  const listeners = eventMap();
  const document = {
    createElement:tag=>new Element(tag),
    createElementNS:(_ns,tag)=>new Element(tag),
    querySelector(selector){
      return selector === '.app-header [data-header-brand-row]' ? brand : null;
    },
    addEventListener(name,cb) {
      const callbacks=listeners.get(name)||[];
      callbacks.push(cb);listeners.set(name,callbacks);
    },
    fire(name,event={}) { for(const cb of listeners.get(name)||[])cb(event); },
  };
  const window = {
    setInterval(fn,ms){assert.equal(ms,1000);ticks=fn;return 1;},
    setTimeout(fn){fn();return 1;},
  };
  class NativeEvent {constructor(type,props={}){this.type=type;this.bubbles=props.bubbles;}}
  const sandbox={window,document,HTMLSelectElement:Select,Event:NativeEvent,console};
  vm.runInNewContext(siteLanguagePickerScript(),sandbox,{filename:'desktop-language-picker.js'});
  return {document,window,body,first,newHeader,tick:()=>ticks(),get changes(){return nativeChanges;}};
}

test('Electron language picker uses four self-contained SVG flags and a dark HTML popup',()=>{
  const dom=mockDocument();
  const select=dom.first.select;
  const wrapper=dom.first.next.children[0];
  assert.equal(wrapper.className,'h00k-desktop-language-picker');
  assert.equal(select.parentNode,dom.first.next,'never move React-controlled select');
  assert.equal(select.style.display,'none');
  assert.equal(select.getAttribute('aria-hidden'),'true');
  const [trigger,menu]=wrapper.children;
  assert.equal(trigger.tagName,'BUTTON');
  assert.equal(trigger.getAttribute('aria-haspopup'),'listbox');
  assert.equal(menu.hidden,true);
  assert.equal(menu.children.length,4);
  assert.equal(trigger.children[0].tagName,'SVG');
  assert.equal(trigger.children[1].textContent,'RU');
  assert.equal(menu.children[0].children[0].tagName,'SVG');
  assert.equal(menu.children[0].children[1].textContent,'Українська');
  assert.match(SITE_LANGUAGE_PICKER_CSS,/background:#0c1724/);
  assert.match(SITE_LANGUAGE_PICKER_CSS,/no-drag/);
  assert.doesNotMatch(siteLanguagePickerScript(),/ipcRenderer|require\('electron'\)/);
});

test('clicking a language updates original React select and retains keyboard and click dismissal',()=>{
  const dom=mockDocument();
  const [trigger,menu]=dom.first.next.children[0].children;
  trigger.click();
  assert.equal(menu.hidden,false);
  assert.equal(menu.children[2].focused,true);
  menu.children[0].click();
  assert.equal(dom.first.select.value,'uk');
  assert.equal(dom.changes,1,'must dispatch the real select change event');
  assert.equal(trigger.children[1].textContent,'UK');
  assert.equal(menu.hidden,true);
  assert.equal(trigger.focused,true);
  trigger.click();
  assert.equal(menu.hidden,false);
  dom.document.fire('keydown',{key:'Escape'});
  assert.equal(menu.hidden,true);
  trigger.click();
  dom.document.fire('pointerdown',{target:new (dom.body.constructor)('div')});
  assert.equal(menu.hidden,true);
});

test('picker rebinds after React unmounts the header and does not duplicate a live picker',()=>{
  const dom=mockDocument();
  const prior=dom.first.next.children[0];
  dom.tick();
  dom.tick();
  assert.equal(dom.first.next.children.filter(x=>x.className==='h00k-desktop-language-picker').length,1);
  dom.first.next.remove();
  const second=dom.newHeader('pl');
  dom.tick();
  assert.equal(prior.isConnected,false);
  assert.equal(second.next.children.filter(x=>x.className==='h00k-desktop-language-picker').length,1);
  const trigger=second.next.children[0].children[0];
  assert.equal(trigger.children[1].textContent,'PL');
  second.select.value='en';
  dom.tick();
  assert.equal(trigger.children[1].textContent,'EN');
});

test('Desktop guards the injection by URL, and packages the script for all website windows',()=>{
  const root=path.join(__dirname,'..');
  const pkg=require('../package.json');
  const source=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
  assert.ok(pkg.build.files.includes('site-language-picker.cjs'));
  const guard=source.slice(source.indexOf('function guardWebsite('),source.indexOf('function attachDockToolbar('));
  assert.match(guard,/isTrustedWebURL\(win\.webContents\.getURL\(\)\)/);
  assert.match(guard,/page\.insertCSS\(SITE_LANGUAGE_PICKER_CSS\)/);
  assert.match(guard,/page\.executeJavaScript\(siteLanguagePickerScript\(\)\)/);
  assert.match(source,/guardWebsite\(win, process\.platform === 'win32'/);
  assert.match(source,/guardWebsite\(standalone, process\.platform === 'win32'/);
});
