export async function POST() {
  return Response.json({ error: 'Self-reported contributions are no longer accepted. Totals are created only by verified payment-provider events.' }, { status: 410 });
}
