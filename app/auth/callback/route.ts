import { NextResponse } from "next/server";
import { SUPABASE_AUTH_CALLBACK_MESSAGE } from "../../lib/authOAuth";
import { authCopy } from "../../lib/authI18n";
import { createSupabaseAuthServerClient } from "../../lib/supabaseAuthServer";

function popupHtml(status: "success" | "error"): string {
  const message =
    status === "success" ? authCopy.callbackClosing : authCopy.callbackFailed;
  const payload = JSON.stringify({
    type: SUPABASE_AUTH_CALLBACK_MESSAGE,
    status,
  });
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LINE Work AI</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f172a;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <p>${message}</p>
  <script>
    (function () {
      var payload = ${payload};
      var target = window.opener;
      if (target) {
        target.postMessage(payload, window.location.origin);
        window.close();
      } else {
        window.location.href = ${JSON.stringify(status === "success" ? "/dashboard" : "/login?error=auth_callback")};
      }
    })();
  </script>
</body>
</html>`;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const popup = searchParams.get("popup") === "1";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    if (popup) {
      return new NextResponse(popupHtml("error"), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.redirect(`${origin}/login?error=auth_callback`);
  }

  const supabase = await createSupabaseAuthServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    if (popup) {
      return new NextResponse(popupHtml("error"), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.redirect(`${origin}/login?error=auth_callback`);
  }

  if (popup) {
    return new NextResponse(popupHtml("success"), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
