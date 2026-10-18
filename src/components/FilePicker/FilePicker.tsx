"use client";

import { useRef } from "react";

interface Props {
  label: string;
  accept?: string;
  onFile: (file: File) => void;
  className?: string;
  disabled?: boolean;
}

/** 숨긴 file input을 버튼으로 연다. 같은 파일을 다시 골라도 onFile이 호출되도록 값을 비운다. */
export function FilePicker({ label, accept = ".json,application/json", onFile, className = "btn", disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()} disabled={disabled}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}
