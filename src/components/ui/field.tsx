"use client";

import { Checkbox } from "@base-ui/react/checkbox";
import { Field } from "@base-ui/react/field";
import { Check } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Shared = {
  description?: ReactNode;
  error?: string;
  label: ReactNode;
  optional?: boolean;
};

function Shell({ children, description, error, label, optional }: Shared & { children: ReactNode }) {
  return (
    <Field.Root className="field" invalid={Boolean(error)}>
      <Field.Label className="field-label">
        {label}
        {optional ? <span className="field-optional">Optional</span> : null}
      </Field.Label>
      {children}
      {description ? <Field.Description className="field-description">{description}</Field.Description> : null}
      {error ? <Field.Error className="field-error" match>{error}</Field.Error> : null}
    </Field.Root>
  );
}

export function TextField({
  description,
  error,
  label,
  optional,
  ...control
}: Shared & ComponentPropsWithoutRef<"input">) {
  return (
    <Shell description={description} error={error} label={label} optional={optional}>
      <Field.Control className="field-control" {...control} />
    </Shell>
  );
}

export function PasswordField(props: Shared & ComponentPropsWithoutRef<"input">) {
  return <TextField autoComplete="current-password" {...props} type="password" />;
}

export function TextareaField({
  description,
  error,
  label,
  optional,
  ...control
}: Shared & ComponentPropsWithoutRef<"textarea">) {
  return (
    <Shell description={description} error={error} label={label} optional={optional}>
      <Field.Control className="field-control" render={<textarea {...control} />} />
    </Shell>
  );
}

export function CheckboxField({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: ReactNode;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="checkbox-field">
      <Checkbox.Root
        checked={checked}
        className="checkbox-box"
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      >
        <Checkbox.Indicator>
          <Check aria-hidden="true" size={11} strokeWidth={3} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span>{label}</span>
    </label>
  );
}
