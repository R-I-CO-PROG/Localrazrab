"use client";

import { useEffect, useRef } from "react";
import styles from "./catalog-manager.module.css";

export interface ModalField {
  key: string;
  label: string;
  type: "text" | "select" | "path";
  value?: string;
  options?: Array<[string, string]>;
}

interface ModalProps {
  open: boolean;
  title: string;
  fields: ModalField[];
  paths: string[];
  onClose: () => void;
  onOk: (values: Record<string, string>) => void | Promise<void>;
}

export function Modal({ open, title, fields, paths, onClose, onOk }: ModalProps) {
  const firstRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (open) firstRef.current?.focus();
  }, [open, fields]);

  if (!open) return null;

  async function handleOk(form: HTMLFormElement) {
    const fd = new FormData(form);
    const values: Record<string, string> = {};
    for (const f of fields) {
      values[f.key] = String(fd.get(f.key) ?? "").trim();
    }
    await onOk(values);
  }

  return (
    <div
      className={`${styles.modalBg} ${styles.modalBgShow}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal}>
        <h3>{title}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleOk(e.currentTarget);
          }}
        >
          {fields.map((f, i) => (
            <div key={f.key}>
              <label htmlFor={`modal-${f.key}`}>{f.label}</label>
              {f.type === "select" ? (
                <select
                  id={`modal-${f.key}`}
                  name={f.key}
                  className={styles.select}
                  defaultValue={f.options?.[0]?.[0] ?? ""}
                  ref={i === 0 ? (firstRef as React.RefObject<HTMLSelectElement>) : undefined}
                >
                  {(f.options ?? []).map(([val, lab]) => (
                    <option key={val} value={val}>
                      {lab}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`modal-${f.key}`}
                  name={f.key}
                  type="text"
                  className={styles.input}
                  list={f.type === "path" ? "pathlist" : undefined}
                  defaultValue={f.value ?? ""}
                  ref={i === 0 ? (firstRef as React.RefObject<HTMLInputElement>) : undefined}
                />
              )}
            </div>
          ))}
          <datalist id="pathlist">
            {paths.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <div className={styles.modalRow}>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>
              Готово
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
