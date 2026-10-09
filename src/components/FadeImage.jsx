import React, { useEffect, useRef, useState } from 'react';

export default function FadeImage({ className = '', onLoad, ...props }) {
  const ref = useRef(null);
  const [loaded, setLoaded] = useState(false);

  // cached images can finish before React attaches onLoad
  useEffect(() => {
    setLoaded(Boolean(ref.current && ref.current.complete && ref.current.naturalWidth));
  }, [props.src]);

  return (
    <img
      ref={ref}
      className={`fade-image ${loaded ? 'is-loaded' : ''} ${className}`}
      onLoad={(e) => {
        setLoaded(true);
        if (onLoad) onLoad(e);
      }}
      {...props}
    />
  );
}
