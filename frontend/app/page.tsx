import { NdaCreator } from "@/components/NdaCreator";
import { loadTemplates } from "@/lib/templates";

/**
 * Server component: the template text is read from the repository at build time
 * and handed to the client, so the browser never fetches the agreement and the
 * user's answers never leave their machine.
 */
export default async function Page() {
  const templates = await loadTemplates();
  return <NdaCreator templates={templates} />;
}
