import { NextResponse } from "next/server";
import { supabase } from "../../supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { error } = await supabase.from("customers").insert([body]);

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