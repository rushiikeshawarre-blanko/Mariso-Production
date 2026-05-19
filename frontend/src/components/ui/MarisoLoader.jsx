import React from "react";

const MarisoLoader = ({ label = "Loading...", className = "" }) => {
  return (
    <div
      className={`flex flex-col items-center justify-center py-16 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex h-28 items-center justify-center">
        <span className="mariso-loader" aria-hidden="true" />
      </div>

      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
};

export default MarisoLoader;