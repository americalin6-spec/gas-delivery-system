import { NextResponse } from "next/server";
import { supabase } from "../../../supabase";
import { parseFirstDateYmdFromText, parseFollowUpDateYmdFromChat } from "../../lib/dateParser";
import { normalizeFollowUpDateValue } from "../../lib/followUpReminders";
import { getServerCompanyId } from "../../lib/companyContext";

function logSaveCompany(companyId: number, body: Record<string, unknown>) {
  console.log("[api/save] insert customer", {
    companyId,
    customer_name: body.customer_name,
    keys: Object.keys(body),
  });
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const companyId = getServerCompanyId(req);
    const body = (await req.json()) as Record<string, unknown>;
    const followUpDate =
      normalizeFollowUpDateValue(body.follow_up_date) ??
      parseFollowUpDateYmdFromChat(asText(body.raw_text)) ??
      parseFollowUpDateYmdFromChat(asText(body.important_date)) ??
      parseFirstDateYmdFromText(asText(body.follow_up)) ??
      parseFirstDateYmdFromText(asText(body.todo)) ??
      parseFirstDateYmdFromText(asText(body.next_step));

    const baseRow = followUpDate ? { ...body, follow_up_date: followUpDate } : body;
    const row = { ...baseRow, company_id: companyId };
    logSaveCompany(companyId, row);

    const { error } = await supabase.from("customers").insert([row]);

    if (error) {
      console.error("Supabase save error:", error);

      return NextResponse.json({
        success: false,
        error,
      });
    }

    return NextResponse.json({
      success: true,
    });
  } catch (err) {
    console.error("Save API error:", err);

    return NextResponse.json({
      success: false,
      err,
    });
  }
}
