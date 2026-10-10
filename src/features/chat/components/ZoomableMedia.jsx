import { useEffect, useRef, useState } from 'react';
import { clampMediaPan, zoomMedia } from '../../../lib/mediaZoom';

const initialView = { scale: 1, x: 0, y: 0 };

export function ZoomableMedia({ children, wheelZoom = false, clickZoom = false, zoom, onZoom, className = '' }) {
  const containerRef = useRef(null);
  const viewRef = useRef(initialView);
  const gestureRef = useRef(null);
  const [view, setView] = useState(initialView);
  const apply = next => { viewRef.current = next; setView(next); onZoom?.(next.scale); };
  useEffect(() => {
    if (zoom === undefined || zoom === viewRef.current.scale) return;
    const next = { scale: zoom, x: 0, y: 0 };
    viewRef.current = next;
    setView(next);
  }, [zoom]);
  useEffect(() => {
    const element = containerRef.current;
    if (!wheelZoom || !element) return;
    const wheel = event => {
      event.preventDefault();
      event.stopPropagation();
      const bounds = element.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      const current = viewRef.current;
      const next = zoomMedia(current, current.scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002), { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 }, bounds);
      viewRef.current = next;
      setView(next);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [wheelZoom]);
  return <div ref={containerRef} className={`relative overflow-hidden ${className}`} style={{ touchAction: view.scale > 1 ? 'none' : 'auto', cursor: view.scale > 1 ? 'grab' : clickZoom ? 'zoom-in' : 'default' }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: viewRef.current, moved: false };
      if (viewRef.current.scale > 1) event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || gesture.origin.scale <= 1) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) gesture.moved = true;
      if (gesture.moved) apply(clampMediaPan({ ...gesture.origin, x: gesture.origin.x + dx, y: gesture.origin.y + dy }, event.currentTarget.getBoundingClientRect()));
    }}
    onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { gestureRef.current = null; }}
    onClick={event => {
      if (gestureRef.current?.moved) { event.stopPropagation(); gestureRef.current = null; return; }
      gestureRef.current = null;
      if (!clickZoom) return;
      event.stopPropagation();
      const bounds = event.currentTarget.getBoundingClientRect();
      apply(zoomMedia(viewRef.current, viewRef.current.scale > 1 ? 1 : 2, { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 }, bounds));
    }}>
    <div className="absolute inset-0 select-none" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: 'center', willChange: view.scale > 1 ? 'transform' : undefined }} onDragStart={event => event.preventDefault()}>{children}</div>
    {wheelZoom && view.scale > 1 && <button type="button" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); apply(initialView); }} className="absolute bottom-3 left-3 z-10 rounded-lg border border-white/15 bg-[#111722]/90 px-2.5 py-1.5 text-xs text-white" title="Yakınlaştırmayı sıfırla">%{Math.round(view.scale * 100)} · Sıfırla</button>}
  </div>;
}
