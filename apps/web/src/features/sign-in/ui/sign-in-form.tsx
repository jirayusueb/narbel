import { Button } from "@narbel/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@narbel/ui/components/field";
import { Input } from "@narbel/ui/components/input";
import { Spinner } from "@narbel/ui/components/spinner";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { authClient } from "@/shared/lib";
import { AuthSwitchLink, PasswordInput } from "@/shared/ui";

export const SignInForm = ({ redirectTo }: { redirectTo?: string }) => {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Wrong credentials sit next to the form that caused them, not in a toast across the page.
  const [formError, setFormError] = useState<string>();

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setFormError(undefined);
      await authClient.signIn.email(value, {
        onSuccess: (ctx) => {
          // an OAuth authorize request is waiting: the client follows `url` itself
          if (ctx.data?.redirect) {
            return;
          }
          router.history.push(redirectTo ?? "/dashboard");
          toast.success("Signed in");
        },
        onError: (error) => {
          setFormError(error.error.message || error.error.statusText);
        },
      });
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Enter a valid email address"),
        // the server judges the password; the form only checks one was typed
        password: z.string().min(1, "Enter your password"),
      }),
    },
    // a press always answers: it re-checks the fields and moves focus to the first problem
    canSubmitWhenInvalid: true,
    // the alerts announce every problem; the keyboard lands on the first one
    onSubmitInvalid: () =>
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      ),
  });

  return (
    <div className="bg-card shadow-surface mx-auto flex w-full max-w-md flex-col gap-8 rounded-xl p-6 max-[19rem]:p-4 sm:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline leading-tight font-normal hyphens-auto">
          Sign in
        </h1>
        <p className="text-muted-foreground text-sm">
          Welcome back. Pick up your boards where you left them.
        </p>
      </div>
      <div>
        <form
          ref={formRef}
          // before hydration a native submit must not put the password in the URL
          method="post"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field name="email">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      autoComplete="email"
                      placeholder="you@team.com"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid}
                      aria-required
                      aria-describedby={invalid ? "email-error" : undefined}
                    />
                    {invalid ? (
                      <FieldError
                        id="email-error"
                        errors={field.state.meta.errors}
                      />
                    ) : null}
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="password">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                    <PasswordInput
                      id={field.name}
                      name={field.name}
                      autoComplete="current-password"
                      placeholder="Your password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid}
                      aria-required
                      aria-describedby={invalid ? "password-error" : undefined}
                    />
                    {invalid ? (
                      <FieldError
                        id="password-error"
                        errors={field.state.meta.errors}
                      />
                    ) : null}
                  </Field>
                );
              }}
            </form.Field>
            {formError ? <FieldError>{formError}</FieldError> : null}
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  className="w-full"
                  isDisabled={isSubmitting}
                >
                  {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                  Sign in
                </Button>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1 text-sm">
        <span className="text-muted-foreground">Need an account?</span>
        <AuthSwitchLink to="/sign-up">Create one</AuthSwitchLink>
      </div>
    </div>
  );
};
