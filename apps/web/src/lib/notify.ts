import { toast } from "sonner";

type ConfirmOptions = {
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export const notify = {
  success(message: string, description?: string) {
    toast.success(message, { description });
  },

  error(message: string, description?: string) {
    toast.error(message, { description, duration: 6000 });
  },

  info(message: string, description?: string) {
    toast.info(message, { description });
  },

  warning(message: string, description?: string) {
    toast.warning(message, { description });
  },

  /** Подтверждение действия — toast снизу справа вместо window.confirm */
  confirm(message: string, options: ConfirmOptions) {
    const {
      description,
      confirmLabel = "Удалить",
      cancelLabel = "Отмена",
      destructive = true,
      onConfirm,
    } = options;

    toast(message, {
      description,
      duration: Infinity,
      action: {
        label: confirmLabel,
        onClick: onConfirm,
      },
      cancel: {
        label: cancelLabel,
        onClick: () => {},
      },
      classNames: destructive
        ? {
            actionButton: "!bg-destructive !text-destructive-foreground",
          }
        : undefined,
    });
  },
};
