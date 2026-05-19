import { NextResponse } from "next/server";
import { supabase } from "../../../supabase";
import { parseFirstDateYmdFromText, parseFollowUpDateYmdFromChat } from "../../lib/dateParser";
import { normalizeFollowUpDateValue } from "../../lib/followUpReminders";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const followUpDate =
      normalizeFollowUpDateValue(body.follow_up_date) ??
      parseFollowUpDateYmdFromChat(asText(body.raw_text)) ??
      parseFollowUpDateYmdFromChat(asText(body.important_date)) ??
      parseFirstDateYmdFromText(asText(body.follow_up)) ??
      parseFirstDateYmdFromText(asText(body.todo)) ??
      parseFirstDateYmdFromText(asText(body.next_step));

    const row = followUpDate ? { ...body, follow_up_date: followUpDate } : body;

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
