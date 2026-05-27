import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

const Toaster = ({
  ...props
}) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast !border-stone-200 !bg-white !text-stone-950 !shadow-lg data-[type=success]:!border-green-200 data-[type=error]:!border-red-200",
          title: "!text-stone-950 !font-medium",
          description: "!text-stone-700",
          success: "!border-green-200 !bg-white !text-stone-950 [&_[data-icon]]:!text-green-700",
          error: "!border-red-200 !bg-white !text-stone-950 [&_[data-icon]]:!text-red-700",
          warning: "!border-amber-200 !bg-white !text-stone-950 [&_[data-icon]]:!text-amber-700",
          info: "!border-blue-200 !bg-white !text-stone-950 [&_[data-icon]]:!text-blue-700",
          actionButton:
            "!bg-stone-900 !text-white",
          cancelButton:
            "!bg-stone-100 !text-stone-800",
        },
      }}
      {...props} />
  );
}

export { Toaster, toast }
