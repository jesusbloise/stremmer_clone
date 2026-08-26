export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import QRCode from "qrcode";
import jwt from "jsonwebtoken";
import { generateSecret, generateURI } from "otplib";

const JWT_SECRET =
  process.env.JWT_SECRET ??
  "dev-secret-cambia-esto";

type TwoFactorSetupChallenge = {
  purpose: "2fa-setup";
  sub: string;
  role: string;
  name: string;
  email: string;
};

export async function POST(req: Request) {
  try {
    const body = await req
      .json()
      .catch(() => ({}));

    const challengeToken =
      typeof body?.challengeToken === "string"
        ? body.challengeToken.trim()
        : "";

    if (!challengeToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Falta el desafío de configuración.",
        },
        { status: 400 }
      );
    }

    let challenge: TwoFactorSetupChallenge;

    try {
      challenge = jwt.verify(
        challengeToken,
        JWT_SECRET
      ) as TwoFactorSetupChallenge;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "La configuración expiró. Inicia sesión nuevamente.",
        },
        { status: 401 }
      );
    }

    if (
      challenge.purpose !== "2fa-setup" ||
      !challenge.sub ||
      !challenge.email
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Desafío de configuración inválido.",
        },
        { status: 401 }
      );
    }

    const secret = generateSecret();

    const otpAuthUrl = generateURI({
      issuer: "Stremmer",
      label: challenge.email,
      secret,
    });

    const qrCodeDataUrl =
      await QRCode.toDataURL(
        otpAuthUrl,
        {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 320,
        }
      );

    return NextResponse.json(
      {
        success: true,
        secret,
        otpAuthUrl,
        qrCodeDataUrl,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "POST /api/2fa/setup error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo preparar Google Authenticator",
      },
      { status: 500 }
    );
  }
}