import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_AUTH_CALLBACK_MESSAGE } from "../../lib/authOAuth";
import { authCopy } from "../../lib/authI18n";
import { resolvePostLoginPath } from "../../lib/authRoutes";
import { createSupabaseAuthRouteClient } from "../../lib/supabaseAuthServer";
import { resolveRequestOrigin } from "../../lib/supabaseConfig";

function popupHtml(
  status: "success" | "error",
  successPath: string,
  appOrigin: string,
): string {
  const message =
    status === "success" ? authCopy.callbackClosing : authCopy.callbackFailed;
  const payload = JSON.stringify({
    type: SUPABASE_AUTH_CALLBACK_MESSAGE,
    status,
  });
  const targetOrigin = appOrigin.replace(/'/g, "\\'");
  const fallbackHref =
    status === "success"
      ? `${appOrigin}${successPath}`
      : `${appOrigin}/login?error=auth_callback`;
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
      var targetOrigin = '${targetOrigin}';
      var target = window.opener;
      if (target) {
        target.postMessage(payload, targetOrigin);
        window.close();
      } else {
        window.location.href = ${JSON.stringify(fallbackHref)};
      }
    })();
  </script>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const popup = searchParams.get("popup") === "1";
  const safeNext = resolvePostLoginPath(searchParams.get("next"));

  const appOriginParam = searchParams.get("app_origin")?.trim();
  const requestOrigin = resolveRequestOrigin(request);
  const appOrigin =
    appOriginParam && /^https?:\/\//i.test(appOriginParam)
      ? appOriginParam.replace(/\/$/, "")
      : requestOrigin;

  const { supabase, withAuthCookies, pendingCookieNames } =
    createSupabaseAuthRouteClient(request);

  const finish = (response: NextResponse, label: string) => {
    const names = pendingCookieNames();
    if (process.env.NODE_ENV !== "production") {
      console.log("[auth/callback]", label, {
        cookieNames: names,
        redirect: response.headers.get("location") ?? "(html)",
      });
    }
    return withAuthCookies(response);
  };

  const respondSuccess = () => {
    if (popup) {
      return finish(
        new NextResponse(popupHtml("success", safeNext, appOrigin), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
        "success",
      );
    }
    return finish(
      NextResponse.redirect(`${appOrigin}${safeNext}`),
      "success-redirect",
    );
  };

  const respondFailure = () => {
    if (popup) {
      return finish(
        new NextResponse(popupHtml("error", safeNext, appOrigin), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
        "failure",
      );
    }
    return finish(
      NextResponse.redirect(`${appOrigin}/login?error=auth_callback`),
      "failure-redirect",
    );
  };

  /** Duplicate callback / refresh after a successful exchange — session already valid. */
  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser();
  if (existingUser) {
    return respondSuccess();
  }

  if (oauthError) {
    return respondFailure();
  }

  if (!code) {
    return respondFailure();
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (process.env.NODE_ENV !== "production") {
    const {
      data: { user: userAfterExchange },
    } = await supabase.auth.getUser();
    console.log("[auth/callback] exchangeCodeForSession", {
      error: error?.message ?? null,
      userId: userAfterExchange?.id ?? null,
    });
  }

  if (error) {
    const {
      data: { user: userAfterExchange },
    } = await supabase.auth.getUser();
    if (userAfterExchange) {
      return respondSuccess();
    }
    console.error("[auth/callback] exchangeCodeForSession:", error.message);
    return respondFailure();
  }

  return respondSuccess();
}
