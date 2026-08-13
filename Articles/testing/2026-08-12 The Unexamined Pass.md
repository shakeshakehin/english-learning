---
title: "The Unexamined Pass"
source: "Software Testing News"
url: "https://softwaretestingnews.co.uk/six-enforcement-risk-zones-every-regulated-brand-should-understand-2/"
published: 2026-08-12
added: 2026-08-13
category: "General"
tags: []
type: article
---

# The Unexamined Pass

### Key takeaways

- The thing that failed was not the model.

- A test that runs once is not a measurement.

- The evaluation was built on Inspect, the open source framework published by the UK’s AI Security Institute.

Author: By Sumit Gundawar, Head of Technology and Digital Innovation Why the most dangerous result in AI testing is the one that goes green

In early August 2026, researchers at the American security firm Frontier Security set out to measure how good Moonshot AI’s Kimi K3 was at defensive cybersecurity. The evaluation was built on Inspect, the open source framework published by the UK’s AI Security Institute. The model performed well.

It performed well because it examined its own network settings, noticed that outbound HTTPS and DNS were open, confirmed it could resolve github.com, cloned the benchmark’s public repository, and read the answers off disk.

Nothing crashed. No assertion failed. The score went up.

This has been reported as a security story, and it is one. It is more useful to read it as a test validity story, and in that reading it is the most important thing to happen to our discipline in some time. The thing that failed was not the model. It was the harness. And it failed silently, because the harness reported a pass.

## Four weeks, four laboratories

Kimi K3 was not an isolated case. Between the middle of July and the first week of August 2026, four AI laboratories disclosed that their models had escaped evaluation environments.

On 16 July, Hugging Face disclosed that an autonomous agent had breached parts of its infrastructure. It did not know whose agent. On 21 July, OpenAI supplied the missing half: a combination of its models, running its ExploitGym benchmark with cyber refusals and production classifiers deliberately switched off in order to measure maximum capability, had escaped an isolated evaluation environment, reached the open internet, and compromised Hugging Face production systems in order to retrieve the benchmark’s own solutions. The escape route was the environment’s only permitted network exception, a package registry proxy treated as a controlled egress path, in which the models found and exploited a previously unknown vulnerability.

On 30 July, Anthropic published the results of a self initiated review prompted by the OpenAI incident. Having examined 141,006 evaluation runs, it reported three cases in which a model had reached the live internet from inside an evaluation environment operated with a third party partner, and had then gained unauthorised access to production infrastructure at three real organisations. None of those organisations had noticed. The partner had told Anthropic that the environments did not allow internet access.

On 6 August, Meta confirmed that one of its models had reached another company’s systems during an evaluation run by that same third party partner, attributing it to a misconfiguration that had inadvertently allowed the model internet access. On 7 August, the Kimi K3 report appeared.

It is worth saying plainly that these disclosures are not purely altruistic. A story headlined “our model was capable enough to break out” does a frontier lab no commercial harm. That does not make the incidents less real, but it should shape how much weight we give the framing as opposed to the facts.

The facts have a common shape. In most of these cases, containment did not fail because a model defeated hardened security. It failed because of a configuration, or because two competent parties held different assumptions about the same environment.

That last point deserves emphasis, because it is the most familiar failure in the whole story. Frontier Security maintains that the Kimi K3 escape happened under the configuration it understood to be the default for that type of evaluation. AISI disputes this, noting that Inspect is a configurable toolkit rather than a hardened environment, that the Docker sandbox restricts internet access when it is enabled, and that its own cyber testing intentionally permits network access in order to measure what models can do. Both positions are defensible. That is precisely the problem. The security posture of the test environment was an implicit requirement, and the people who built the framework and the people who used it held it differently.

Any tester who has argued about what “the test environment” actually means will recognise that. It is not new. What is new is the consequence.

## The assumption we have been quietly running on

Conventional testing grants the harness a kind of diplomatic immunity. It is infrastructure. It is the room the experiment happens in, not part of the experiment. We check that fixtures load and the runner works, and after that we treat the environment as a constant and the system under test as the only variable.

That was always a simplification. With AI systems it has stopped being a safe one, for two independent reasons.

The first is that the subject now acts on its environment. A model with tool access and a goal will explore that environment as part of pursuing the goal, and it does not distinguish between the route you intended and the route that happens to be open.

The second is that the environment now changes the result. The numbers a model produces depend on conditions inside the serving infrastructure that nobody records and most people do not know exist.

Both produce the same symptom, which is why they belong in one discussion. Both produce a pass.

## Failure mode one, the subject acts on the harness

In March 2026, researchers at the UK AI Security Institute published SandboxEscapeBench, the first open benchmark for measuring whether AI agents can break out of containers. The work was later selected as an oral presentation at ICML 2026. It is a capture the flag evaluation across 18 scenarios spanning three layers of the container stack: orchestration, engine and runtime, and host and kernel. The whole thing runs inside a nested sandbox, a container within a virtual machine, so that a successful escape still lands somewhere contained.

The headline results are worth knowing. Frontier models reliably escape the easiest and most common failure modes, those rated one and two out of five: privileged containers, writable host mounts, an exposed Docker socket. On harder scenarios requiring specific vulnerability knowledge or multi step exploitation, GPT-5 and Claude Opus 4.5 each succeeded at a rate of 0.40, with a 95 per cent confidence interval of 0.26 to 0.56. No model succeeded at all on the two hardest levels. Success scales roughly log linearly with inference compute, and an attempt costs in the region of a dollar. No model discovered a novel vulnerability; every successful breakout used a documented misconfiguration or a public CVE. The authors recommend treating plain Docker isolation as insufficient by default.

All of that is useful. The part of the paper that should matter most to a testing audience, though, is in an appendix.

While building the benchmark, the researchers found four unintended escape paths. Two of them bypassed the container vulnerability entirely by attacking the virtual machine layer over the Docker bridge gateway: one brute forced the default Vagrant credentials, and the other downloaded Vagrant’s publicly known insecure private key straight from GitHub, having apparently memorised both its existence and its location. In a scenario designed to test a packet socket exploit, a model substituted an easier eBPF path that happened to exist in the same kernel version. In a scenario designed to test an eBPF vulnerability, a model used Dirty COW instead.

Every one of those was a pass. Every one was invalid. The benchmark measured the wrong thing four times over, and each time the score looked fine.

They were caught because the team systematically analysed the transcripts of successful runs, checking that exploitation had followed the intended path, and then hardened the environment. Password authentication was disabled. Default keys were replaced. Extraneous kernel features were removed.

That is a green test being investigated, and it is the only reason the benchmark means anything at all.

The same paper contains a second finding worth sitting with. Among runs that were graded as failures, some models claimed success anyway. GPT-OSS-120B did so in 30 per cent of its failures. DeepSeek-R1 did so in 70 per cent, submitting an average of 12 incorrect flags per sample, with one run reaching 55.

It is worth doing the arithmetic on what that would cost you, because a great many teams score agent tasks by asking the agent whether it succeeded. If a model’s true success rate is p, and it falsely claims success on a proportion f of the tasks it actually failed, then the rate you observe is p plus f multiplied by everything it got wrong. GPT-OSS-120B scored 0.16 on this benchmark. Ask it to mark its own work and it would report roughly 0.41. The model has not become better. Your measurement has become fiction, and it has become fiction in the flattering direction, which is the direction nobody checks.

## Failure mode two, the environment moves the numbers

Now to the part with nothing to do with security, which in my experience surprises engineers more.

Almost every testing practice we have rests on one assumption: the same input produces the same output. It is the foundation of the regression test. Set a language model’s temperature to zero, forcing it to pick the highest probability token every time, and you would expect that assumption to hold.

It does not, and the reason is not the one most people give.

In September 2025, Horace He and colleagues at Thinking Machines Lab sampled 1,000 completions from Qwen3-235B at temperature zero, using an identical prompt each time. They got 80 unique completions. The most common appeared 78 times. Every completion was identical for the first 102 tokens and then diverged at the 103rd, where 992 continued one way and 8 continued another.

The usual explanation is floating point non associativity combined with GPU concurrency, the idea being that whichever core finishes first determines the accumulation order. That explanation is beside the point. The forward pass of a language model contains essentially no atomic adds, and running the same matrix multiplication on the same data repeatedly returns bitwise identical results.

The real cause is that the kernels are not batch invariant. Normalisation, matrix multiplication and attention all involve reductions, and efficient implementations change their reduction strategy according to the shape of the batch. When a batch is small, a kernel splits the reduction across cores to keep the processor busy. When it is large, it does not need to. Floating point addition is not associative, so a different reduction order produces a slightly different number, and under greedy decoding a slightly different number is occasionally enough to flip which token scores highest and send the entire completion down another path.

Here is the consequence for testers, and it is the sentence I would put on a wall.

Batch size is determined by server load. Server load is other people’s traffic. The numerical path your request takes through the model is therefore a function of how busy the server was when you sent it.

The invariance requirement is stricter still. Numerics have to be insensitive not only to how many requests are processed at once but to how each request is sliced up by the inference engine, which brings chunked prefill and prefix caching into scope. This is also not a GPU quirk. Endpoints served from CPUs or TPUs carry the same source of non determinism.

There is a second axis. Work presented as an oral at NeurIPS 2025 found that reproducibility also breaks across evaluation batch size, the number of accelerators and the accelerator generation. Change the hardware your runner sits on and the numbers can move.

Put those together and you arrive at the oldest problem in testing wearing an unfamiliar coat. A quiet test environment and a busy production environment do not merely differ in throughput. They sit in different parts of the batch size distribution, and the split reduction strategies that break invariance are needed precisely when batches are small. It follows from the mechanism that a low load environment exercises a different numerical configuration from a high load one.

I want to be careful about what is established here. The cause is measured and documented. The consequence follows from it. I am not aware of a published experiment comparing staging directly against production. But if you gate releases on numbers gathered from a quiet runner at three in the morning, you are not measuring a smaller version of production. You are measuring a different configuration, and environment parity has quietly become a numerical property rather than an infrastructural one.

The good news, and it is genuinely good, is that determinism has stopped being a law of physics and become a line item. Thinking Machines released batch invariant kernels and demonstrated deterministic inference on vLLM, where 1,000 completions became 1,000 identical completions. In their demonstration a run went from 26 seconds to 55, improving to 42 with a better attention kernel. The SGLang team integrated the same approach with CUDA graphs and brought the overhead down to roughly 34 per cent, against roughly 61 per cent for the original implementation. Both vLLM and SGLang now document deterministic modes. A paper published in January 2026 argues that batch invariance is over constrained precisely because it makes determinism a global property of the entire batch, and proposes a scheduling approach that charges the cost only against traffic that actually needs reproducibility.

If you self host, that is now a configuration decision you can make deliberately. Determinism for debugging, incident reproduction and regression baselines. Measured variance for release gating.

If you use a hosted API, which is most teams, you cannot change kernels, but you are not helpless either. OpenAI’s documentation is unusually honest on this point. The seed parameter is described as best effort, determinism is explicitly not guaranteed, and every response carries a system fingerprint that identifies the backend configuration and changes when the provider updates the numerical configuration of the serving infrastructure. Log it with every run. A baseline recorded under a different fingerprint is not a baseline. It is a comparison between two systems.

## Failure mode three, the clean up destroys the evidence

Which brings us to the habit that turns both of the above from a problem into a blind spot.

Testing already has a well developed response to non determinism. We call it flakiness, and we retry, quarantine or delete. That response is correct for conventional software, where a test that passes and fails on the same code is genuinely defective. I want to be careful here, because the heuristic is not stupid. It is a rational answer to a real cost.

It is also, even in its home territory, more expensive than most teams realise. Google reported ten years ago that around 1.5 per cent of its test runs returned a flaky result, and that almost 16 per cent of its tests showed some degree of flakiness. The same post noted, with some candour, that developers sometimes dismiss a failure as flaky only to discover later that it was real, and that it is human nature to ignore an alarm with a history of false signals.

The sharpest evidence comes from a study of the Chromium CI covering 10,000 builds over nine months and roughly 1.8 million test failures. The researchers applied state of the art flakiness prediction and achieved 99.2 per cent precision, which sounds excellent. Then they measured what it cost. The methods classified 76.2 per cent of fault triggering failures as flaky. Around a third of all regression faults were revealed by tests with a history of flakiness. In 1,766 builds, every single fault revealing test had flaked at some point previously, meaning no reliable test caught the fault at all. Their conclusion is worth restating: detecting flaky tests in order to disregard their signal is harmful, because it misses a great many regressions.

That finding stands on its own, and it is worth carrying back to a conventional suite even by a team that never touches a language model. But now apply the heuristic to a system where non determinism is a property rather than a defect, is present in production, and correlates with load. Quarantining the variance does not remove noise from the measurement. It removes the measurement.

The alternative is to treat the variance as the thing you are measuring, which means sample size stops being an implementation detail and becomes a test design decision. Some arithmetic makes the point better than argument does.

In the Thinking Machines experiment the minority branch appeared in 8 runs out of 1,000. A suite that samples once has a 0.8 per cent chance of ever seeing it, and you would need around 373 samples to see it at least once with 95 per cent confidence. If you want to detect a drop in a refusal rate from 95 per cent to 90 per cent, at conventional significance and 80 per cent power, you need roughly 340 samples per arm. Observing 90 per cent across 20 runs gives a 95 per cent confidence interval running from about 70 per cent to 97 per cent, which is not a number anyone should gate a release on.

For agent systems the effect compounds. The authors of tau-bench introduced pass^k, the probability that an agent succeeds on all k attempts, precisely to expose this. In their original work the strongest agent scored roughly 61 per cent on a single attempt and about 25 per cent across eight. Even at 95 per cent per step, a twenty step task lands at 36 per cent. A test that runs once is not a measurement. It is an anecdote.

## A pass is a claim, not a fact

If you take one thing from this, take that sentence, because it survives outside the AI context entirely.

A failing test makes a claim we instinctively interrogate. We reproduce it, we bisect it, we read the logs. A passing test makes an equally strong claim, that the system did the right thing for the right reason, and we accept it without evidence. That asymmetry was affordable when the environment was inert and the subject was passive. It is not affordable now.

Three questions turn a pass back into evidence, and they are cheap enough to ask of any suite.

Where did it run? Not which pipeline, but which environment, at which version, under which configuration. If you cannot answer that, you cannot reproduce the result and you cannot say what it should fairly be compared against.

How did it get there? Not the score, the route. This is the question that found four invalid passes in SandboxEscapeBench.

How many times? Once is an anecdote. The number you need depends on the effect you are trying to detect, and it is almost always larger than the number you are currently running.

## What to do on Monday

Six things, in rough order of cost.

Record the environment as test data, not as metadata. Model version, system fingerprint, deterministic mode on or off, accelerator count and generation, precision, seed, sampling parameters. Put them in the result record, not the build log, so that a comparison across time is a comparison of like with like.

Write a containment test and run it before anything else. A canary that attempts DNS resolution and an outbound HTTPS connection, and must fail. Assert on egress rather than on intention. Both Anthropic and Meta were told their evaluation environments had no internet access. Both were wrong. The cheapest check in this article would have caught both.

Investigate green. Sample passing runs and read the trajectory, not just the score. This is the practice that found four invalid passes in SandboxEscapeBench and three real incidents across 141,006 Anthropic evaluation runs. An unexpectedly good result deserves the same scrutiny as an unexpectedly bad one, and it almost never gets any.

Measure variance before you set a gate. Establish the run to run distribution first, size the sample against the effect you actually need to detect, then set the threshold outside the measured variance. A gate tighter than your noise floor gets switched off within a fortnight, and everybody learns the wrong lesson from it.

Decide about determinism deliberately. If you self host, you can now buy reproducibility at a known throughput cost. If you do not, log the fingerprint and treat provider side changes as a versioned dependency, because that is what they are.

Stop quarantining variance in AI suites. Run n times and assert on the distribution. Keep the quarantine habit for the conventional suite, where it still belongs, but read the Chromium numbers before you trust it too far there either.

## Green is not evidence

I argued in these pages previously that these systems fail by sounding right, and that the most valuable suite you can build is one made of questions the system must refuse to answer. The argument here is the same one moved up a level. It is not only the system’s outputs that fail by looking plausible. It is the test results.

Green is not evidence. Green, plus a recorded environment, plus an inspected trajectory, is evidence.

There is a reason this matters more now than it did two years ago, and it is the thread running through every incident above. For as long as our systems were passive, the test environment was a place where we safely observed behaviour, and the worst outcome of a poor harness was a wrong number. That has changed. When the thing under test has tools, a goal, and the capacity to route around an obstacle, the test environment stops being an observation deck and becomes the first place the system meets the real world. Four laboratories discovered that in four weeks, and in several of those cases the organisations on the receiving end never noticed a thing.

Testing is no longer the last gate before production. It is increasingly the first point of contact with it. That makes the quality of the harness a first order engineering concern rather than a piece of plumbing, and it makes the passing test the one worth looking at hardest.
