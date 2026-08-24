"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

import logoUDD from "@/../public/Logo_Stock_Library@2x.png";

const ATTEMPTS_KEY = "login_attempts";

// 🔊 Desbloquea audio en el mismo gesto del usuario
function unlockAudio() {
  try {
    const AudioCtx =
      (window as any).AudioContext ||
      (window as any).webkitAudioContext;

    const ctx = new AudioCtx();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Volumen casi cero (inaudible)
    gain.gain.value = 0.0001;

    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);

    ctx.resume?.();

    sessionStorage.setItem(
      "audioUnlocked",
      "1"
    );

    console.log("🔓 Audio desbloqueado");
  } catch (e) {
    console.warn(
      "No se pudo desbloquear audio:",
      e
    );
  }
}

export default function LoginPage() {
  const router = useRouter();

  // =====================================================
  // LOGIN NORMAL
  // =====================================================

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  // =====================================================
  // 2FA EXISTENTE
  // =====================================================

  const [
    twoFactorStep,
    setTwoFactorStep,
  ] = useState(false);

  const [
    twoFactorCode,
    setTwoFactorCode,
  ] = useState("");

  // =====================================================
  // CHALLENGE
  // =====================================================

  const [
    challengeToken,
    setChallengeToken,
  ] = useState("");

  // =====================================================
  // CONFIGURACIÓN OBLIGATORIA 2FA
  // =====================================================

  const [
    twoFactorSetupStep,
    setTwoFactorSetupStep,
  ] = useState(false);

  const [
    setupSecret,
    setSetupSecret,
  ] = useState("");

  const [
    setupQrCode,
    setSetupQrCode,
  ] = useState("");

  const [
    setupCode,
    setSetupCode,
  ] = useState("");

  // =====================================================
  // ESTADO GENERAL
  // =====================================================

  const [attempts, setAttempts] =
    useState(0);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  // =====================================================
  // INTENTOS DE LOGIN
  // =====================================================

  useEffect(() => {
    const saved = Number(
      localStorage.getItem(
        ATTEMPTS_KEY
      ) ?? "0"
    );

    setAttempts(
      Number.isFinite(saved)
        ? saved
        : 0
    );
  }, []);

  useEffect(() => {
    localStorage.setItem(
      ATTEMPTS_KEY,
      String(attempts)
    );
  }, [attempts]);

  // =====================================================
  // LOGIN
  // =====================================================

  const handleLogin = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setError(null);

    // 🔊 Debe ejecutarse antes de cualquier await
    unlockAudio();

    try {
      setLoading(true);

      const res = await fetch(
        "/api/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data =
        await res
          .json()
          .catch(() => ({}));

      // =================================================
      // ERROR DE CREDENCIALES
      // =================================================

      if (!res.ok) {
        const next =
          attempts + 1;

        setAttempts(next);

        if (next >= 3) {
          setError(
            "Demasiados intentos fallidos. Verifica tus datos o solicita ayuda al administrador."
          );

          localStorage.removeItem(
            ATTEMPTS_KEY
          );
        } else {
          const restantes =
            3 - next;

          setError(
            `${
              data?.error ||
              "Credenciales inválidas"
            }. Intentos restantes: ${restantes}`
          );
        }

        return;
      }

      // =================================================
      // USUARIO SIN 2FA
      // CONFIGURACIÓN OBLIGATORIA
      // =================================================

      if (
        data?.requiresTwoFactorSetup
      ) {
        const token =
          data.challengeToken || "";

        if (!token) {
          setError(
            "No se pudo iniciar la configuración de seguridad."
          );
          return;
        }

        setChallengeToken(
          token
        );

        setError(null);

        /*
         * Pedimos al backend un secreto y QR
         * utilizando el challenge temporal.
         *
         * Todavía NO existe cookie auth.
         */
        const setupResponse =
          await fetch(
            "/api/2fa/setup",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                challengeToken:
                  token,
              }),
            }
          );

        const setupData =
          await setupResponse
            .json()
            .catch(() => ({}));

        if (
          !setupResponse.ok
        ) {
          setError(
            setupData?.error ||
              "No se pudo preparar Google Authenticator."
          );
          return;
        }

        if (
          !setupData?.secret ||
          !setupData?.qrCodeDataUrl
        ) {
          setError(
            "El servidor no pudo generar la configuración de Google Authenticator."
          );
          return;
        }

        setSetupSecret(
          setupData.secret
        );

        setSetupQrCode(
          setupData.qrCodeDataUrl
        );

        setSetupCode("");

        setTwoFactorSetupStep(
          true
        );

        setTwoFactorStep(
          false
        );

        return;
      }

      // =================================================
      // USUARIO QUE YA TIENE 2FA
      // =================================================

      if (
        data?.requiresTwoFactor
      ) {
        const token =
          data.challengeToken || "";

        if (!token) {
          setError(
            "No se pudo iniciar la verificación en dos pasos."
          );
          return;
        }

        setChallengeToken(
          token
        );

        setTwoFactorStep(
          true
        );

        setTwoFactorSetupStep(
          false
        );

        setTwoFactorCode("");

        setError(null);

        return;
      }

      /*
       * Por seguridad, con 2FA obligatorio
       * no deberíamos llegar aquí.
       *
       * No permitimos entrar si el backend
       * no solicitó verificación o setup.
       */
      setError(
        "No se pudo completar la verificación de seguridad."
      );
    } catch (err: any) {
      console.error(
        "LOGIN ERROR:",
        err
      );

      setError(
        err?.message ||
          "No se pudo completar el inicio de sesión."
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // VERIFICAR 2FA EXISTENTE
  // =====================================================

  const handleTwoFactorVerify =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      setError(null);

      const cleanCode =
        twoFactorCode.replace(
          /\D/g,
          ""
        );

      if (
        cleanCode.length !== 6
      ) {
        setError(
          "Ingresa el código de 6 dígitos de Google Authenticator."
        );
        return;
      }

      if (!challengeToken) {
        setError(
          "La verificación expiró. Vuelve a iniciar sesión."
        );
        return;
      }

      try {
        setLoading(true);

        const res =
          await fetch(
            "/api/login/2fa",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  challengeToken,
                  code: cleanCode,
                }),
            }
          );

        const data =
          await res
            .json()
            .catch(() => ({}));

        if (!res.ok) {
          setError(
            data?.error ||
              "No se pudo verificar el código."
          );
          return;
        }

        localStorage.setItem(
          "showSplash",
          "true"
        );

        localStorage.removeItem(
          ATTEMPTS_KEY
        );

        router.replace("/");
      } catch (error) {
        console.error(
          "Error verificando 2FA:",
          error
        );

        setError(
          "No se pudo completar la verificación."
        );
      } finally {
        setLoading(false);
      }
    };

  // =====================================================
  // ACTIVACIÓN OBLIGATORIA DE 2FA
  // =====================================================

  const handleTwoFactorSetup =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      setError(null);

      const cleanCode =
        setupCode.replace(
          /\D/g,
          ""
        );

      if (
        cleanCode.length !== 6
      ) {
        setError(
          "Ingresa el código de 6 dígitos generado por Google Authenticator."
        );
        return;
      }

      if (
        !challengeToken ||
        !setupSecret
      ) {
        setError(
          "La configuración de seguridad no está disponible. Inicia sesión nuevamente."
        );
        return;
      }

      try {
        setLoading(true);

        const res =
          await fetch(
            "/api/2fa/enable",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  challengeToken,
                  secret:
                    setupSecret,
                  token:
                    cleanCode,
                }),
            }
          );

        const data =
          await res
            .json()
            .catch(() => ({}));

        if (!res.ok) {
          setError(
            data?.error ||
              "No se pudo activar la verificación en dos pasos."
          );
          return;
        }

        /*
         * /api/2fa/enable crea la cookie auth
         * solamente después de validar el código.
         */

        localStorage.setItem(
          "showSplash",
          "true"
        );

        localStorage.removeItem(
          ATTEMPTS_KEY
        );

        router.replace("/");
      } catch (error) {
        console.error(
          "Error configurando 2FA:",
          error
        );

        setError(
          "No se pudo completar la configuración."
        );
      } finally {
        setLoading(false);
      }
    };

  // =====================================================
  // VOLVER AL LOGIN
  // =====================================================

  const resetSecurityFlow =
    () => {
      setTwoFactorStep(
        false
      );

      setTwoFactorSetupStep(
        false
      );

      setTwoFactorCode("");

      setSetupCode("");

      setSetupSecret("");

      setSetupQrCode("");

      setChallengeToken("");

      setError(null);
    };

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* Columna izquierda */}
      <div className="hidden md:flex items-center justify-center bg-black text-white">
        <Image
          src={logoUDD}
          alt="Logo UDD Plus"
          width={400}
          height={400}
          priority
        />
      </div>

      {/* Columna derecha */}
      <div className="flex flex-col items-center justify-center px-6 py-12 bg-black text-white">
        {/* Logo mobile */}
        <div className="md:hidden mb-6">
          <Image
            src={logoUDD}
            alt="Logo UDD Plus"
            width={150}
            height={150}
          />
        </div>

        <div className="w-full max-w-md space-y-6">
          {/* TÍTULO DINÁMICO */}

          <div className="text-center">
            <h2 className="text-2xl font-semibold">
              {twoFactorSetupStep
                ? "Protege tu cuenta"
                : twoFactorStep
                  ? "Verificación de seguridad"
                  : "Inicio de sesión"}
            </h2>

            <p className="mt-2 text-sm text-zinc-400">
              {twoFactorSetupStep
                ? "Configura Google Authenticator para continuar"
                : twoFactorStep
                  ? "Confirma tu identidad para acceder"
                  : "Ingresa tu correo y contraseña"}
            </p>
          </div>

          {/* ERROR */}

          {error && (
            <div className="rounded-lg border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* =================================================
              SETUP OBLIGATORIO
          ================================================= */}

          {twoFactorSetupStep ? (
            <form
              onSubmit={
                handleTwoFactorSetup
              }
              className="space-y-4"
            >
              <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4">
                <p className="font-semibold text-orange-200">
                  Configuración de seguridad obligatoria
                </p>

                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Para utilizar
                  Atomica debes
                  activar la
                  verificación en
                  dos pasos.
                </p>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Abre Google
                  Authenticator en
                  tu teléfono,
                  escanea el código
                  QR y luego ingresa
                  el código de 6
                  dígitos generado
                  por la aplicación.
                </p>
              </div>

              {/* QR */}

              {setupQrCode && (
                <div className="flex justify-center rounded-xl bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      setupQrCode
                    }
                    alt="Código QR para Google Authenticator"
                    className="h-56 w-56"
                  />
                </div>
              )}

              {/* CLAVE MANUAL */}

              {setupSecret && (
                <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3">
                  <p className="text-xs text-zinc-500">
                    Si no puedes
                    escanear el QR,
                    introduce
                    manualmente esta
                    clave:
                  </p>

                  <p className="mt-2 break-all text-center font-mono text-sm text-zinc-200">
                    {
                      setupSecret
                    }
                  </p>
                </div>
              )}

              {/* CÓDIGO */}

              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={setupCode}
                onChange={(e) =>
                  setSetupCode(
                    e.target.value
                      .replace(
                        /\D/g,
                        ""
                      )
                      .slice(
                        0,
                        6
                      )
                  )
                }
                className="w-full rounded bg-zinc-800 border border-zinc-600 px-4 py-3 text-center text-xl tracking-[0.4em] focus:outline-none focus:border-orange-500"
                required
                disabled={
                  loading
                }
                autoFocus
              />

              <button
                type="submit"
                disabled={
                  loading ||
                  setupCode.length !==
                    6
                }
                className="w-full rounded bg-orange-500 py-2.5 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
              >
                {loading
                  ? "Activando..."
                  : "Activar y continuar"}
              </button>

              <button
                type="button"
                disabled={
                  loading
                }
                onClick={
                  resetSecurityFlow
                }
                className="w-full text-sm text-zinc-400 transition hover:text-white"
              >
                Volver al inicio
                de sesión
              </button>

              <p className="text-center text-xs text-zinc-500">
                La verificación
                en dos pasos es
                obligatoria para
                todas las cuentas
                de Atomica.
              </p>
            </form>
          ) : !twoFactorStep ? (
            /* =============================================
               LOGIN NORMAL
            ============================================= */

            <form
              onSubmit={
                handleLogin
              }
              className="space-y-4"
            >
              <input
                type="email"
                placeholder="correoelectrónico@dominio.com"
                value={email}
                onChange={(e) =>
                  setEmail(
                    e.target
                      .value
                  )
                }
                className="w-full px-4 py-2 rounded bg-zinc-800 border border-zinc-600 focus:outline-none"
                required
                disabled={
                  loading
                }
              />

              <input
                type="password"
                placeholder="Contraseña"
                value={
                  password
                }
                onChange={(e) =>
                  setPassword(
                    e.target
                      .value
                  )
                }
                className="w-full px-4 py-2 rounded bg-zinc-800 border border-zinc-600 focus:outline-none"
                required
                disabled={
                  loading
                }
              />

              <div className="flex items-center justify-end text-sm">
                <a
                  href="/forgot-password"
                  className="underline text-blue-400"
                >
                  ¿Olvidaste tu
                  contraseña?
                </a>
              </div>

              <button
                type="submit"
                disabled={
                  loading
                }
                className="w-full bg-white text-black font-semibold py-2 rounded hover:bg-zinc-300 transition disabled:opacity-60"
              >
                {loading
                  ? "Ingresando..."
                  : "Iniciar sesión"}
              </button>
            </form>
          ) : (
            /* =============================================
               VERIFICACIÓN 2FA EXISTENTE
            ============================================= */

            <form
              onSubmit={
                handleTwoFactorVerify
              }
              className="space-y-4"
            >
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
                <p className="text-sm font-medium text-white">
                  Verificación en
                  dos pasos
                </p>

                <p className="mt-2 text-sm text-zinc-400">
                  Abre Google
                  Authenticator e
                  ingresa el código
                  de 6 dígitos
                  asociado a tu
                  cuenta.
                </p>
              </div>

              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={
                  twoFactorCode
                }
                onChange={(e) =>
                  setTwoFactorCode(
                    e.target.value
                      .replace(
                        /\D/g,
                        ""
                      )
                      .slice(
                        0,
                        6
                      )
                  )
                }
                className="w-full rounded bg-zinc-800 border border-zinc-600 px-4 py-3 text-center text-xl tracking-[0.4em] focus:outline-none focus:border-orange-500"
                required
                disabled={
                  loading
                }
                autoFocus
              />

              <button
                type="submit"
                disabled={
                  loading ||
                  twoFactorCode.length !==
                    6
                }
                className="w-full bg-white text-black font-semibold py-2 rounded hover:bg-zinc-300 transition disabled:opacity-60"
              >
                {loading
                  ? "Verificando..."
                  : "Verificar código"}
              </button>

              <button
                type="button"
                disabled={
                  loading
                }
                onClick={
                  resetSecurityFlow
                }
                className="w-full text-sm text-zinc-400 transition hover:text-white"
              >
                Volver al inicio
                de sesión
              </button>
            </form>
          )}

          {/* =================================================
              GOOGLE
              Solo aparece en pantalla inicial
          ================================================= */}

          {!twoFactorStep &&
            !twoFactorSetupStep && (
              <>
                <div className="flex items-center justify-center gap-4 text-zinc-400 text-sm">
                  <hr className="border-zinc-600 w-1/5" />

                  <span>
                    o continuar con
                  </span>

                  <hr className="border-zinc-600 w-1/5" />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem(
                      "showSplash",
                      "true"
                    );

                    unlockAudio();

                    signIn(
                      "google",
                      {
                        callbackUrl:
                          "/auth/google-complete",
                      }
                    );
                  }}
                  className="w-full border border-zinc-600 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-medium py-2 rounded flex items-center justify-center gap-2 transition"
                  aria-label="Continuar con Google"
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      fill="#FFC107"
                      d="M43.611 20.083H42V20H24v8h11.303C33.826 32.33 29.274 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.869 6.053 29.7 4 24 4 12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20c0-1.341-.138-2.65-.389-3.917z"
                    />

                    <path
                      fill="#FF3D00"
                      d="M6.306 14.691l6.571 4.819C14.674 16.108 18.994 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.869 6.053 29.7 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
                    />

                    <path
                      fill="#4CAF50"
                      d="M24 44c5.19 0 9.93-1.98 13.5-5.2l-6.2-5.2C29.14 35.771 26.715 36 24 36c-5.252 0-9.792-3.354-11.387-8.034l-6.492 5.006C9.444 39.567 16.18 44 24 44z"
                    />

                    <path
                      fill="#1976D2"
                      d="M43.611 20.083H42V20H24v8h11.303c-1.109 3.233-3.571 5.84-6.803 7.6l6.2 5.2C36.429 41.246 44 36 44 24c0-1.341-.138-2.65-.389-3.917z"
                    />
                  </svg>

                  Continuar con
                  Google
                </button>
              </>
            )}

          {/* TÉRMINOS */}

          <p className="text-xs text-zinc-400 mt-4 text-center">
            Al continuar aceptas
            nuestros{" "}
            <a
              href="#"
              className="underline"
            >
              Términos de servicio
            </a>{" "}
            y{" "}
            <a
              href="#"
              className="underline"
            >
              Política de privacidad
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}