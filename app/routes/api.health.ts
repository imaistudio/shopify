import prisma from "../db.server";

export async function loader() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Health check failed:", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
