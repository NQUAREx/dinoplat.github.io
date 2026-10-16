/** Local manual/editor scrolling while native page gestures remain disabled. */
export function panelScroll(root: HTMLElement, signal: AbortSignal) {
  let pointer = -1,
    y = 0,
    scroll = 0;
  root.addEventListener(
    "pointerdown",
    (event) => {
      if (
        event.pointerType !== "touch" ||
        (event.target as Element).closest("button,input,a")
      )
        return;
      pointer = event.pointerId;
      y = event.clientY;
      scroll = root.scrollTop;
      root.setPointerCapture(pointer);
    },
    { signal },
  );
  root.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerId === pointer)
        root.scrollTop = scroll + y - event.clientY;
    },
    { signal },
  );
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    root.addEventListener(
      type,
      () => {
        pointer = -1;
      },
      { signal },
    );
}
