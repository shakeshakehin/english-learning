---
title: "The Unanswerable Test Suite: How to Test AI Systems That Sound Right When They Are Wrong"
source: "Software Testing News"
url: "https://softwaretestingnews.co.uk/the-unanswerable-test-suite/"
published: 2026-07-17
added: 2026-08-11
category: "General"
tags: []
type: article
---

# The Unanswerable Test Suite: How to Test AI Systems That Sound Right When They Are Wrong

Author: Sumit G, Head of Technology & Digital Innovation In October 2025, one of the world’s largest consulting firms agreed to repay part of a contract worth close to 440,000 Australian dollars.

The report it had delivered to Australia’s Department of Employment and Workplace Relations ran to 237 pages and read exactly the way a report at that price should read: confident, structured, thoroughly referenced.

The problem was the references.

A University of Sydney academic went through them line by line and found citations to research papers that did not exist, a book attributed to a real law professor that she had never written, and a quoted passage from a Federal Court judgment that appears nowhere in the actual ruling.

The firm republished a corrected version, disclosed that a generative AI system had been used in the drafting, and refunded the final instalment of the contract.

Strip away the embarrassment and there is a precise engineering lesson in what happened. The report did not fail because AI was involved.

It failed because the output went through review processes designed to catch human mistakes, and AI systems do not make human mistakes. A human researcher under deadline pressure writes something vague.

A language model under no pressure at all writes something specific, plausible, and fabricated, complete with page numbers. Every quality gate that document passed was calibrated for the wrong failure mode.

If you test software for a living, this is now your problem, because these systems are landing inside the products you are responsible for.

And the uncomfortable truth is that the testing instincts that serve you well everywhere else will quietly miss the defect that matters most.

The defect with no stack trace Traditional testing rests on a bargain with the software: same input, same output, and when something breaks, it breaks visibly.

An exception, a failed assertion, a wrong value you can diff against the right one. Hallucination honours none of that. The system fails by succeeding fluently.

There is no crash, no error state, no signal in the response that distinguishes a grounded answer from an invented one. The defect is a sentence that reads well. Worse, the failure is not deterministic.

Ask the same question twice and you may get a clean answer and a fabricated one from the same build. A test that passed on Tuesday tells you less than you think about Wednesday.

This is why teams that bolt a few example prompts onto their regression suite end up with a green pipeline and a lurking incident: they are testing that the system can be right, which was never in doubt.

The question is how it behaves when being right is not available. The suite nobody writes Here is the shift that changes how these systems need to be tested.

Most teams build an evaluation set out of questions the system should answer correctly, a golden set, and measure how often it does. That suite is necessary and it is not the one that protects you.

The suite that protects you is made of questions the system must not answer, because the honest response is that the sources do not say. Call it the unanswerable suite. It is built from three families.

The first is absent facts: questions about things that simply are not in the system’s sources.

If the knowledge base covers your product’s pricing but not your competitor’s, then a question about the competitor’s pricing has exactly one correct answer, a refusal.

The second is false premises: questions that assume something untrue, such as asking what a report concluded when no such report exists.

A system that answers the question has accepted the premise and is now elaborating on a fiction, which is precisely how a fabricated Federal Court quotation gets written.

The third is boundary questions: requests that sit just outside what the system is for, where the safe behaviour is to decline and hand over to a human rather than improvise. Each test in the suite passes when the system refuses.

text}” Run a suite like this against most freshly built AI features and the result is sobering.

Systems tuned for helpfulness treat every question as answerable, so the refusal rate on genuinely unanswerable questions starts out dismal.

That number, the refusal rate on the unanswerable suite, is the single most informative metric available for how a system will behave in the wild, because real users ask unanswerable questions constantly.

They ask about things the documents do not cover, they misremember names, they assume facts that are wrong.

Every one of those is an invitation to fabricate, and the unanswerable suite is a census of how often the invitation gets accepted.

Assert on evidence, not on eloquence The second habit is about how you judge the answers the system does give. The fashionable approach is to use another language model as the judge, scoring responses for accuracy.

Used carelessly, this stacks the same failure mode twice: model judges have well documented preferences for longer, more confident, more fluent answers, which is to say they are charmed by exactly the qualities that make hallucination dangerous.

For anything that matters, anchor the assertion to the sources instead.

The pattern is claim-level checking: take the answer, extract its factual claims, and verify each one appears in the retrieved documents the answer was supposedly grounded in.

Where the claims are numeric, the check becomes fully deterministic, and deterministic checks are where a tester’s instincts come back into their own.

source_documents) assert claimed <= allowed, f”unsupported values in answer: {claimed – allowed}” On clinical platforms, where a retrieved document can contain dosage values, this rule is absolute: any number in a generated answer must be traceable to a source document, verified by string and value matching, not by another model’s opinion.

A fluency judge can advise. It does not get a vote on safety-critical values.

The general principle travels to any domain: decide which claims in your system’s answers are load-bearing, and test those claims against evidence with the dumbest, most deterministic check you can write.

Dumb checks do not get charmed. The suite runs on a schedule, not at release One more habit separates teams that stay safe from teams that were safe at launch. Everything underneath an AI feature moves.

Model providers update weights and defaults. Your document corpus grows and changes. Prompts get tweaked by someone fixing an unrelated complaint.

Any of these can shift the refusal behaviour of the whole system without a single line of your code changing, which means a passing run last month is archaeology, not assurance.

So the golden suite and the unanswerable suite run on a schedule, the way uptime checks do, and the numbers are tracked over time. The trend is the alarm.

A refusal rate that drifts downward over weeks is a system growing quietly overconfident, and you want that conversation to start in a dashboard review, not in the aftermath of a customer acting on an answer that should never have existed.

What the review missed Go back to that 237-page report.

No plausible amount of conventional proofreading was going to save it, because conventional proofreading checks whether references are formatted correctly, not whether they exist.

The failure was catchable, but only by a check built for the actual failure mode: take every citation, every quotation, every specific factual claim, and verify it against the thing it claims to come from.

That is not a reading task. It is a test, and it was never run. That is the job now.

Systems that can fabricate have to be tested for fabrication, deliberately and continuously, with suites designed around the questions they cannot answer and the claims they cannot support.

Keep your golden set, and measure what the system gets right. Then build the suite that matters more, and measure what it refuses.

The most expensive answer an AI system can give is the one it should never have given at all, and no test you currently run will catch it unless you put it there on purpose.
