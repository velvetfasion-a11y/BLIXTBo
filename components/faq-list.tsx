import { homeFaqs } from "@/lib/seo";

export function FaqList() {
  const faqs = homeFaqs();
  return (
    <div className="divide-y divide-line border-y border-line">
      {faqs.map((item) => (
        <article key={item.question} className="py-5">
          <h3 className="text-base font-medium">{item.question}</h3>
          <p className="mt-2 text-sm leading-relaxed text-soft">{item.answer}</p>
        </article>
      ))}
    </div>
  );
}
