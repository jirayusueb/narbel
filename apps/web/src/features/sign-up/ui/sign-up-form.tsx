import { Button } from "@narbel/ui/components/button";
import {
  Field,
  FieldDescription,
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

export const SignUpForm = ({ redirectTo }: { redirectTo?: string }) => {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // A refused sign-up (e.g. the email is taken) sits next to the form, not in a toast across the page.
  const [formError, setFormError] = useState<string>();

  const form = useForm({
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
    onSubmit: async ({ value: { firstName, lastName, email, password } }) => {
      setFormError(undefined);
      // Better Auth keeps one display name; a single-word name leaves the last name empty
      const name = [firstName, lastName]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" ");
      await authClient.signUp.email(
        { name, email, password },
        {
          onSuccess: (ctx) => {
            // an OAuth authorize request is waiting: the client follows `url` itself
            if (ctx.data?.redirect) {
              return;
            }
            router.history.push(redirectTo ?? "/dashboard");
            toast.success("Account created");
          },
          onError: (error) => {
            setFormError(error.error.message || error.error.statusText);
          },
        }
      );
    },
    validators: {
      onSubmit: z.object({
        firstName: z.string().trim().min(1, "Enter your first name"),
        lastName: z.string(),
        email: z.email("Enter a valid email address"),
        password: z.string().min(8, "That password is too short"),
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
          Create account
        </h1>
        <p className="text-muted-foreground text-sm">
          Start drawing boards you can share with your team and your agents.
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
            <div className="grid gap-5 @[22rem]/field-group:grid-cols-2 @[22rem]/field-group:gap-3">
              <form.Field name="firstName">
                {(field) => {
                  const invalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={invalid}>
                      <FieldLabel htmlFor={field.name}>First name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        autoComplete="given-name"
                        placeholder="Ada"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={invalid}
                        aria-required
                        aria-describedby={
                          invalid ? "first-name-error" : undefined
                        }
                      />
                      {invalid ? (
                        <FieldError
                          id="first-name-error"
                          errors={field.state.meta.errors}
                        />
                      ) : null}
                    </Field>
                  );
                }}
              </form.Field>
              <form.Field name="lastName">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>
                      Last name{" "}
                      <span className="text-muted-foreground font-normal">
                        (optional)
                      </span>
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      autoComplete="family-name"
                      placeholder="Lovelace"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </Field>
                )}
              </form.Field>
            </div>
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
                      autoComplete="new-password"
                      placeholder="Choose a password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid}
                      aria-required
                      aria-describedby={
                        invalid
                          ? "password-hint password-error"
                          : "password-hint"
                      }
                    />
                    <FieldDescription id="password-hint">
                      At least 8 characters.
                    </FieldDescription>
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
                  Create account
                </Button>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1 text-sm">
        <span className="text-muted-foreground">Already have an account?</span>
        <AuthSwitchLink to="/sign-in">Sign in</AuthSwitchLink>
      </div>
    </div>
  );
};
