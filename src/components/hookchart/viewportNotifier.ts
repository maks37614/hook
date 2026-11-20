/**
 * Decouple the chart's high-frequency gesture commits from parent component
 * viewport notifications. The chart itself still updates and paints every
 * freshest viewport; parents only receive the latest viewport per display frame.
 *
 * Focus, reset, profile changes and other non-gesture updates remain immediate.
 * There are no market requests, timers, or extra canvas operations.
 */
type FrameClock={request(callback:()=>void):number;cancel(id:number):void};
export type ViewportNotification<V,G extends string>={
  viewport:V;
  kind:G|null;
  onChange?:(viewport:V)=>void;
  onGesture?:(viewport:V,kind:G)=>void;
};

export function createChartViewportNotifier<V,G extends string>(
  clock:FrameClock={
    request:callback=>requestAnimationFrame(callback),
    cancel:id=>cancelAnimationFrame(id),
  },
){
  let frame:number|null=null;
  let pending:ViewportNotification<V,G>|null=null;
  let generation=0;
  const emit=(notification:ViewportNotification<V,G>)=>{
    notification.onChange?.(notification.viewport);
    if(notification.kind)notification.onGesture?.(notification.viewport,notification.kind);
  };
  const cancel=()=>{
    generation++;
    if(frame!==null)clock.cancel(frame);
    frame=null;
    pending=null;
  };
  return {
    request(notification:ViewportNotification<V,G>){
      pending=notification;
      if(frame!==null)return;
      const token=++generation;
      frame=clock.request(()=>{
        if(token!==generation)return;
        frame=null;
        const latest=pending;
        pending=null;
        if(latest)emit(latest);
      });
    },
    flush(notification:ViewportNotification<V,G>){
      cancel();
      emit(notification);
    },
    cancel,
  };
}
