export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function withCors(body: unknown, status = 200) {
  return Response.json(body, {status, headers: corsHeaders});
}

export function optionsResponse() {
  return new Response(null, {status: 204, headers: corsHeaders});
}
