"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import logoUDD from "@/../public/Logo_Stock_Library@2x.png";

type Props = {
  inviteToken: string;
};

type InviteStatus =
  | "checking"
  | "valid"
  | "invalid";

type InviteValidation = {
  valid?: boolean;
  email?: string | null;
  expiresAt?: string | null;
  error?: string;
};

export default function RegisterPage({
  inviteToken,
}: Props) {
  const router = useRouter();

  const [inviteStatus, setInviteStatus] =
    useState<InviteStatus>("checking");

  const [inviteError, setInviteError] =
    useState("");

  const [inviteEmail, setInviteEmail] =
    useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] =
    useState("");
  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [ok, setOk] =
    useState<string | null>(null);

  const redirectTimer =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) {
        clearTimeout(
          redirectTimer.current
        );
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function validateInvite() {
      const token =
        inviteToken.trim();

      if (!token) {
        if (active) {
          setInviteStatus("invalid");
          setInviteError(
            "El registro de Atomica es privado. Necesitas una invitación autorizada para crear una cuenta."
          );
        }

        return;
      }

      try {
        setInviteStatus("checking");
        setInviteError("");

        const response = await fetch(
          `/api/register?invite=${encodeURIComponent(
            token
          )}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result =
          (await response
            .json()
            .catch(
              () => ({})
            )) as InviteValidation;

        if (!response.ok || !result.valid) {
          throw new Error(
            result?.error ||
              "La invitación no es válida."
          );
        }

        if (!active) {
          return;
        }

        const authorizedEmail =
          String(
            result.email || ""
          )
            .trim()
            .toLowerCase() || null;

        setInviteEmail(
          authorizedEmail
        );

        if (authorizedEmail) {
          setEmail(authorizedEmail);
        }

        setInviteStatus("valid");
      } catch (validationError: any) {
        if (!active) {
          return;
        }

        setInviteStatus("invalid");

        setInviteError(
          validationError?.message ||
            "La invitación no existe, venció o ya fue utilizada."
        );
      }
    }

    void validateInvite();

    return () => {
      active = false;
    };
  }, [inviteToken]);

  const handleRegister = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    setError(null);
    setOk(null);

    if (inviteStatus !== "valid") {
      setError(
        "Necesitas una invitación válida para registrarte."
      );
      return;
    }

    if (
      password !== confirmPassword
    ) {
      setError(
        "Las contraseñas no coinciden."
      );
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        "/api/register",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name,
            email,
            password,
            invite:
              inviteToken.trim(),
          }),
        }
      );

      const result = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setError(
          result?.error ||
            "No se pudo completar el registro."
        );
        return;
      }

      setOk(
        "Cuenta creada correctamente. Te redirigiremos al inicio de sesión."
      );

      redirectTimer.current =
        setTimeout(() => {
          router.push("/login");
        }, 2500);
    } catch (registerError) {
      console.error(
        "REGISTER ERROR:",
        registerError
      );

      setError(
        "Ocurrió un error al crear la cuenta."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-black md:grid-cols-2">
      <div className="hidden items-center justify-center bg-black text-white md:flex">
        <Image
          src={logoUDD}
          alt="Atomica Stock Library"
          width={400}
          height={400}
          priority
        />
      </div>

      <div className="flex flex-col items-center justify-center bg-black px-6 py-12 text-white">
        <div className="mb-6 md:hidden">
          <Image
            src={logoUDD}
            alt="Atomica Stock Library"
            width={150}
            height={150}
          />
        </div>

        <div className="w-full max-w-md">
          {inviteStatus ===
            "checking" && (
            <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-orange-400" />

              <h1 className="mt-5 text-xl font-semibold">
                Validando invitación
              </h1>

              <p className="mt-2 text-sm text-zinc-400">
                Estamos comprobando que
                tu enlace de registro sea
                válido.
              </p>
            </section>
          )}

          {inviteStatus ===
            "invalid" && (
            <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center shadow-2xl">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-orange-500/30 bg-orange-500/10 text-2xl">
                🔒
              </div>

              <h1 className="mt-5 text-2xl font-bold">
                Registro privado
              </h1>

              <p className="mt-3 text-sm leading-6 text-zinc-400">
                {inviteError}
              </p>

              <p className="mt-3 text-sm leading-6 text-zinc-500">
                Solicita acceso al
                administrador de Atomica
                para recibir un enlace
                privado de registro.
              </p>

              <Link
                href="/login"
                className="mt-6 inline-flex w-full justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-orange-500/60 hover:text-orange-300"
              >
                Ir al inicio de sesión
              </Link>
            </section>
          )}

          {inviteStatus ===
            "valid" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-300">
                  Invitación válida
                </div>

                <h1 className="text-2xl font-semibold">
                  Crea tu cuenta
                </h1>

                <p className="mt-2 text-sm text-zinc-400">
                  Completa tus datos para
                  ingresar a Atomica.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}

              {ok && (
                <div className="rounded-lg border border-green-500 bg-green-500/10 px-3 py-2 text-sm text-green-300">
                  {ok}
                </div>
              )}

              <form
                onSubmit={handleRegister}
                className="space-y-4"
              >
                <input
                  type="text"
                  placeholder="Nombre"
                  value={name}
                  onChange={(event) =>
                    setName(
                      event.target.value
                    )
                  }
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2.5 outline-none transition focus:border-orange-500"
                  required
                  disabled={
                    loading || Boolean(ok)
                  }
                />

                <input
                  type="email"
                  placeholder="correo@dominio.com"
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value
                    )
                  }
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2.5 outline-none transition focus:border-orange-500 disabled:cursor-not-allowed disabled:opacity-70"
                  required
                  readOnly={Boolean(
                    inviteEmail
                  )}
                  disabled={
                    loading || Boolean(ok)
                  }
                />

                {inviteEmail && (
                  <p className="-mt-2 text-xs text-zinc-500">
                    Esta invitación fue
                    creada exclusivamente
                    para este correo.
                  </p>
                )}

                <input
                  type="password"
                  placeholder="Contraseña (mínimo 6 caracteres)"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2.5 outline-none transition focus:border-orange-500"
                  required
                  minLength={6}
                  disabled={
                    loading || Boolean(ok)
                  }
                />

                <input
                  type="password"
                  placeholder="Confirmar contraseña"
                  value={
                    confirmPassword
                  }
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value
                    )
                  }
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2.5 outline-none transition focus:border-orange-500"
                  required
                  minLength={6}
                  disabled={
                    loading || Boolean(ok)
                  }
                />

                <button
                  type="submit"
                  disabled={
                    loading || Boolean(ok)
                  }
                  className="w-full rounded-lg bg-white py-2.5 font-semibold text-black transition hover:bg-zinc-300 disabled:opacity-60"
                >
                  {loading
                    ? "Creando cuenta..."
                    : "Crear cuenta"}
                </button>
              </form>

              <p className="text-center text-sm text-zinc-400">
                ¿Ya tienes una cuenta?{" "}
                <Link
                  href="/login"
                  className="text-blue-400 underline"
                >
                  Inicia sesión
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}