import { Button } from "@/components/ui/button";
/* Ghost Protocol style: no generic error card; a missing route reads like a quiet field-log exception. */
import { ArrowLeft, FileQuestion } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="empty-state max-w-2xl">
      <FileQuestion size={30} className="copper mb-5" />
      <div className="eyebrow">Exception / 404</div>
      <h3>That record is not in the register.</h3>
      <p>The route you requested does not map to an operational surface in this build.</p>
      <Link href="/"><Button className="button-quiet"><ArrowLeft size={15} /> Back to operations</Button></Link>
    </div>
  );
}
