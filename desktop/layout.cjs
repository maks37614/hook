'use strict';

// The left/right/bottom edges remain flush with the terminal. For panes
// *above* a Windows terminal, leave a small shadow/caption safety strip:
// DWM extended-frame bounds omit the shadow, which otherwise paints over
// the bottom of a short h00k chart. Never resize or lift the trading terminal.
const DOCK_GAP = 0;
const TOP_DOCK_CLEARANCE = 2; // Minimal visible seam in Electron DIP (not an 8px gap).
// Separate spacing between multiple h00k panels (not between h00k and the terminal).
const PANEL_GAP = 4;
const MIN_WIDTH = 210;
const MIN_HEIGHT = 140;
function finiteRect(rect) {
  if (!rect || !['x','y','width','height'].every(k => Number.isFinite(rect[k]))) return false;
  return rect.width > 0 && rect.height > 0;
}
function clamp(value, min, max) { return Math.max(min, Math.min(value, max)); }

/**
 * The terminal itself is never resized or covered by dock placement.
 * Return [] when the requested side has insufficient monitor work area.
 * Rectangles use Electron logical display pixels (DIP), not Win32 physical pixels.
 */
function dockRects(target, work, side, width, height, count) {
  if (!finiteRect(target) || !finiteRect(work) || !Number.isInteger(count) || count < 1 || count > 12) return [];
  if (!['right', 'left', 'top', 'bottom'].includes(side)) return [];
  const right = target.x + target.width;
  const bottom = target.y + target.height;
  const workRight = work.x + work.width;
  const workBottom = work.y + work.height;
  const horizontal = side === 'right' || side === 'left';
  const free = side === 'right' ? workRight - right - DOCK_GAP
    : side === 'left' ? target.x - work.x - DOCK_GAP
    : side === 'bottom' ? workBottom - bottom - DOCK_GAP
    : target.y - work.y - TOP_DOCK_CLEARANCE;
  const thickness = Math.min(horizontal ? width : height, free);
  if (thickness < (horizontal ? MIN_WIDTH : MIN_HEIGHT)) return [];

  const startX = horizontal
    ? side === 'right' ? right + DOCK_GAP : target.x - thickness - DOCK_GAP
    : clamp(target.x, work.x, workRight - Math.min(work.width, target.width));
  const startY = horizontal
    ? clamp(target.y, work.y, workBottom - Math.min(work.height, target.height))
    : side === 'bottom' ? bottom + DOCK_GAP : target.y - thickness - TOP_DOCK_CLEARANCE;
  const longSize = horizontal ? Math.min(target.height, workBottom - startY)
    : Math.min(target.width, workRight - startX);
  const segment = (longSize - PANEL_GAP * (count - 1)) / count;
  if (segment < (horizontal ? MIN_HEIGHT : MIN_WIDTH)) return [];
  return Array.from({length:count}, (_, index) => ({
    x: Math.round(startX + (horizontal ? 0 : index * (segment + PANEL_GAP))),
    y: Math.round(startY + (horizontal ? index * (segment + PANEL_GAP) : 0)),
    width: Math.round(horizontal ? thickness : segment),
    height: Math.round(horizontal ? segment : thickness),
  }));
}
function floatingRects(target, work, width, height, count, side = 'right') {
  if (!finiteRect(work) || !Number.isInteger(count) || count < 1 || count > 12) return [];
  const w = Math.min(width, work.width);
  const h = Math.min(height, work.height);
  const validTarget = finiteRect(target);
  const baseX = !validTarget
    ? side === 'left' ? work.x + 24
      : side === 'right' ? work.x + work.width - w - 24
      : work.x + Math.round((work.width - w) / 2)
    : side === 'left' ? target.x - w - DOCK_GAP
    : side === 'top' || side === 'bottom' ? target.x + 32
    : target.x + target.width + DOCK_GAP;
  const baseY = !validTarget
    ? side === 'top' ? work.y + 24
      : side === 'bottom' ? work.y + work.height - h - 24
      : work.y + Math.round((work.height - h) / 2)
    : side === 'top' ? target.y - h - DOCK_GAP
    : side === 'bottom' ? target.y + target.height + DOCK_GAP
    : target.y + 32;
  return Array.from({length: count}, (_, index) => ({
    x: Math.round(clamp(baseX + index * 36, work.x, work.x + work.width - w)),
    y: Math.round(clamp(baseY + index * 36, work.y, work.y + work.height - h)),
    width: Math.round(w),
    height: Math.round(h),
  }));
}


const AUTO_SIDES = Object.freeze(['right', 'left', 'top', 'bottom']);
function intersectsRect(a, b) {
  return finiteRect(a) && finiteRect(b) &&
    a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;
}
function freeRuns(start, end, blocked) {
  const intervals = blocked
    .map(span => [Math.max(start, span[0]), Math.min(end, span[1])])
    .filter(([a,b]) => b > a)
    .sort((a,b) => a[0] - b[0] || a[1] - b[1]);
  const runs = [];
  let cursor = start;
  for (const [left,right] of intervals) {
    if (left > cursor) runs.push([cursor,left]);
    cursor = Math.max(cursor,right);
    if (cursor >= end) break;
  }
  if (cursor < end) runs.push([cursor,end]);
  return runs;
}
// Positive depths represent distances outwards from the terminal edge.
function obstacleDepth(rect, side, target) {
  if (side === 'right') return [rect.x - (target.x + target.width),
    rect.x + rect.width - (target.x + target.width)];
  if (side === 'left') return [target.x - (rect.x + rect.width), target.x - rect.x];
  if (side === 'bottom') return [rect.y - (target.y + target.height),
    rect.y + rect.height - (target.y + target.height)];
  const safeEdge = target.y - TOP_DOCK_CLEARANCE;
  return [safeEdge - (rect.y + rect.height), safeEdge - rect.y];
}
/**
 * Try all four terminal sides across monitors, excluding occupied areas
 * of other visible top-level windows. Select a contiguous vacant segment
 * along the terminal edge; reduce panel thickness when needed, never below
 * the minimum safe pane size. Input rectangles are all in Electron DIP.
 */
function chooseDockPlacement(target, workAreas, width, height, count,
    previousPlacement = null, occupied = []) {
  if (!finiteRect(target) || !Array.isArray(workAreas) ||
      !Number.isInteger(count) || count < 1 || count > 12) return null;
  const blockers = Array.isArray(occupied) ? occupied.filter(finiteRect) : [];
  const choices = [];
  for (const [workIndex,work] of workAreas.entries()) {
    if (!finiteRect(work)) continue;
    const wr=work.x+work.width, wb=work.y+work.height;
    const tr=target.x+target.width, tb=target.y+target.height;
    for (const side of AUTO_SIDES) {
      const horizontal=side==='right'||side==='left';
      const edge=side==='right' ? tr : side==='left' ? target.x
        : side==='bottom' ? tb : target.y - TOP_DOCK_CLEARANCE;
      const longStart=Math.ceil(horizontal
        ? Math.max(work.y,target.y) : Math.max(work.x,target.x));
      const longEnd=Math.floor(horizontal
        ? Math.min(wb,tb) : Math.min(wr,tr));
      const minLong=horizontal ? MIN_HEIGHT : MIN_WIDTH;
      if (longEnd-longStart < count*minLong + (count-1)*PANEL_GAP) continue;
      const maxNormal=side==='right' ? wr-tr : side==='left' ? target.x-work.x
        : side==='bottom' ? wb-tb : target.y-work.y-TOP_DOCK_CLEARANCE;
      const minNormal=horizontal ? MIN_WIDTH : MIN_HEIGHT;
      const preferred=horizontal ? width : height;
      const maxDepth=Math.floor(Math.min(preferred,maxNormal));
      // The attach edge must belong to the monitor; a panel cannot jump
      // across a physical gap between two displays.
      if (maxDepth < minNormal || (horizontal
        ? edge < work.x || edge > wr : edge < work.y || edge > wb)) continue;
      const relevant=blockers.map(rect=>{
        const tangentStart=horizontal?rect.y:rect.x;
        const tangentEnd=tangentStart+(horizontal?rect.height:rect.width);
        const depth=obstacleDepth(rect,side,target);
        return {start:tangentStart,end:tangentEnd,near:depth[0],far:depth[1]};
      }).filter(item=>item.end>longStart && item.start<longEnd &&
        item.far>0 && item.near<maxDepth);
      const candidateDepths=new Set([maxDepth,minNormal]);
      for (const item of relevant) {
        const depth=Math.floor(item.near);
        if (depth>=minNormal && depth<=maxDepth) candidateDepths.add(depth);
      }
      const sorted=[...candidateDepths].sort((a,b)=>b-a);
      // Bound CPU work even if hundreds of top-level windows are visible.
      const depths=sorted.length>48 ? [...sorted.slice(0,47),minNormal] : sorted;
      for (const depth of depths) {
        if (depth<minNormal || depth>maxDepth) continue;
        const blocked=relevant.filter(item=>item.near<depth && item.far>0)
          .map(item=>[item.start,item.end]);
        for (const [from,to] of freeRuns(longStart,longEnd,blocked)) {
          const length=Math.floor(to-from);
          const segment=Math.floor((length-PANEL_GAP*(count-1))/count);
          if (segment<minLong) continue;
          const boxes=Array.from({length:count},(_,i)=>{
            const along=Math.round(from+i*(segment+PANEL_GAP));
            return horizontal ? {
              x:Math.round(side==='right'?tr:target.x-depth),
              y:along,width:depth,height:segment,
            } : {
              x:along,y:Math.round(side==='bottom'?tb:target.y-TOP_DOCK_CLEARANCE-depth),
              width:segment,height:depth,
            };
          });
          if (!boxes.every(b=>
            b.x>=work.x && b.y>=work.y && b.x+b.width<=wr && b.y+b.height<=wb &&
            !intersectsRect(b,target) && !blockers.some(other=>intersectsRect(b,other)))) continue;
          choices.push({
            side,workIndex,boxes,
            freeArea:boxes.reduce((area,b)=>area+b.width*b.height,0),
            headroom:maxNormal*(longEnd-longStart),
          });
        }
      }
    }
  }
  if (!choices.length) return null;
  choices.sort((a,b)=> b.freeArea-a.freeArea || b.headroom-a.headroom ||
    AUTO_SIDES.indexOf(a.side)-AUTO_SIDES.indexOf(b.side) || a.workIndex-b.workIndex);
  const best=choices[0];
  const previous=previousPlacement && choices.find(item=>
    item.side===previousPlacement.side && item.workIndex===previousPlacement.workIndex);
  return previous && previous.freeArea>=best.freeArea*0.85 ? previous : best;
}
module.exports = { TOP_DOCK_CLEARANCE, dockRects, floatingRects, finiteRect, intersectsRect, chooseDockPlacement };
