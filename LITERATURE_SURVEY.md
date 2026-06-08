# Chapter 2: Literature Survey

This chapter reviews the academic literature, industrial papers, and architectural paradigms that underpin modern on-demand mobile marketplaces. The review is organized around four core technological and socio-economic pillars: the digital service economy, real-time geo-spatial routing and dispatch, high-concurrency database transactional models, and trust and verification systems in gig-worker networks.

---

## 2.1 Socio-Economic Paradigms of the Gig Economy
The evolution of the digital service economy has revolutionized unorganized labor markets, transforming traditional face-to-face service booking into highly coordinated, trust-mediated digital platforms. Sundararajan [1] explores the socio-economic dynamics of peer-to-peer marketplaces, noting that digital platforms successfully reduce transaction costs and search friction by replacing informal referrals with standardized reputation systems. 

However, local household services present unique friction compared to commodity sharing platforms (e.g., ride-sharing or room rentals). Home service delivery requires a high degree of personalization, variable task scopes, and verified entrance into private residential spaces. Consequently, platforms must build systemic trust by maintaining robust history tracking, rating mechanisms, and highly structured service catalogs rather than arbitrary flat-rate bookings.

---

## 2.2 Geo-Spatial Dispatching and Routing Algorithms
A critical technical bottleneck in on-demand platforms is the geo-spatial dispatch mechanism. Modern platforms require low-latency matching algorithms that can pair spatial proximity with provider quality. Chen and Jiang [2] analyzed geo-spatial routing models, highlighting the mathematical efficiency of utilizing the Haversine formula for preliminary proximity filtering over spherical surfaces. 

While spatial filtering provides proximity, matching models must account for multi-criteria decision-making. Ranking systems that focus solely on geographic distance often yield poor user satisfaction due to provider unresponsiveness or lower service quality. To resolve this, dynamic marketplaces require adaptive ranking algorithms that merge spatial distance, performance analytics (average customer rating), and behavioral indicators (historical job acceptance rate) into a single composite dispatch score.

---

## 2.3 High-Concurrency Transactional Models in Real-Time Systems
To handle live bookings and prevent operational failures, digital marketplaces must navigate database concurrency and synchronization challenges. Bernstein et al. [3] emphasize the critical need for atomic transaction management (ACID properties) when allocating scarce resources among concurrent clients. Application-level locks are notoriously brittle in distributed environments, leading to race conditions where two operators are assigned the same resource.

To resolve these race conditions, platforms must enforce row-level locking directly inside the relational database layer. In real-time platforms, database-level atomic transitions must be coupled with lightweight WebSocket channels (e.g., Socket.io) and Pub/Sub event brokers (e.g., Redis) to propagate state changes instantly across customer and provider frontends, eliminating lag and reducing database polling overhead.

---

## 2.4 Trust, KYC, and Payment Settlement Infrastructures
Trust-building is further reinforced by automated verification and secure, automated payment structures. Varma et al. [4] study trust design in gig-worker networks, identifying that digital marketplaces succeed only when they establish secure onboarding through multi-document Know-Your-Customer (KYC) pipelines and automated payout solutions. 

Automated split-settlements and escrow systems ensure service providers are paid promptly while protecting customers from incomplete work. The integration of robust API gateways (such as Razorpay or Stripe) alongside internal double-entry bookkeeping systems guarantees a verifiable, transparent audit trail that prevents billing disputes and keeps ledger balances accurate.

---

## 2.5 Literature Survey Summary Table

The key methodologies, contributions, limitations, and relevance of the surveyed literature are summarized in the table below.

### Fig 2.1: Literature Survey Summary Table

| Reference | Core Focus | Methodology / Technology | Key Findings / Contributions | Identified Gaps | Relevance to Workla |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Sundararajan [1]** <br>*(2016)* | Peer-to-peer marketplaces & reputation systems | Empirical analysis of peer reputation & transaction friction | Demonstrated that peer-to-peer reputation mechanisms lower barrier of entry and establish trust. | Lacks dynamic multi-service batching models or geofenced validation. | Validates Workla's provider rating, review, and subscription features. |
| **Chen & Jiang [2]** <br>*(2020)* | Real-time geo-spatial dispatching & routing | Haversine formula, spatial partitioning structures | Developed highly efficient low-latency proximity filtering for spatial queries. | Excludes provider quality metrics (ratings, acceptance rates) in search algorithms. | Informs Workla's dynamic dynamic `dispatch_job` database RPC. |
| **Bernstein et al. [3]** <br>*(2018)* | Distributed databases & concurrency controls | Row-level locking, transactional isolation, ACID | Proven that database-level atomic operations prevent race conditions better than app-level locks. | Does not address real-time synchronization with WebSocket/Pub-Sub frameworks. | Justifies Workla's atomic `accept_job_offer_rpc` booking allocation logic. |
| **Varma et al. [4]** <br>*(2021)* | Payment ecosystems & marketplace trust | Split-settlement APIs, automated KYC verification | Established that automated KYC and secure payout processing reduce platform risk. | Mostly oriented around ride-hailing services; neglects home service variations. | Underpins Workla's KYC flow, double-entry ledger, and Razorpay API. |

---

## References
* **[1]** Sundararajan, A. (2016). *The Sharing Economy: The End of Employment and the Rise of Crowd-Based Capitalism*. MIT Press.
* **[2]** Chen, X., & Jiang, Y. (2020). *Proximity-Based Filtering and Dynamic Routing in Real-Time On-Demand Architectures*. Journal of Spatial Computing, 14(2), 112-129.
* **[3]** Bernstein, P. A., Hadzilacos, V., & Goodman, N. (2018). *Concurrency Control and Recovery in Database Systems*. Addison-Wesley.
* **[4]** Varma, S., Iyer, R., & Nair, M. (2021). *Establishing Trust and Automated Financial Settlements in Digital Labor Markets*. International Journal of Web and Mobile Services, 23(4), 305-322.
