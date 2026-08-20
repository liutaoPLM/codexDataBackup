Environment:

* China-based development environment
* Preferred language: Chinese
* Java, Swing, Eclipse Plugin, Teamcenter, Teamcenter Active Workspace
* C++ and Visual Studio projects
* Do NOT use Java lambda expressions unless explicitly requested

Coding Style:

* Prefer maintainable enterprise-style code
* Keep compatibility with older JDK versions when possible
* Pay attention to file encoding issues (UTF-8 / GBK / GB2312)
* Preserve original file encoding when modifying files
* Chinese log output is preferred
* Detailed log printing is required for important operations and exceptions
* Except for proper nouns, code comments should be in Chinese.

Teamcenter SOA Development Rules:

* For Teamcenter SOA development, prefer batch service requests whenever the API supports processing multiple objects in one request.
* Minimize the number of client-server round trips to improve execution efficiency and reduce Teamcenter server communication overhead.
* Avoid invoking SOA service methods repeatedly inside loops when the same operation can be completed using a single batch request.
* When processing multiple Teamcenter objects, collect the required objects or parameters first, then submit them through the appropriate bulk/batch SOA API whenever possible.
* When retrieving properties for multiple Teamcenter objects, prefer bulk property loading instead of requesting properties object by object.
* When multiple objects require the same Teamcenter operation, first check whether the corresponding SOA service supports array/list/vector-style input before implementing per-object requests.
* If a batch API is unavailable and individual SOA calls are unavoidable, keep the number of remote calls as low as reasonably possible.
* When reviewing or optimizing existing Teamcenter SOA code, explicitly identify unnecessary server round trips and propose batch-request alternatives where applicable.
* Do not sacrifice correctness, transaction semantics, permission handling, or error handling solely to reduce the number of SOA requests.
* For batch SOA operations, properly inspect and handle partial errors so that failures of individual objects can be identified and logged clearly.

C++ / Teamcenter Rules:

* Use read-only static analysis for C++ projects by default
* DO NOT compile, rebuild, clean, run, or test C++ code unless explicitly requested
* DO NOT execute msbuild, cmake, ninja, devenv, make, or cleanup commands automatically
* DO NOT modify Release/Debug/build/bin/out directories
* Avoid automatic PowerShell-based project cleanup behavior

Agent Behavior Rules:

* Prefer analysis over execution
* Stop immediately after repeated failures
* Automatic self-repair attempts must NOT exceed 2 times
* After 3 failed attempts, stop and explain:

  * root cause
  * failed command
  * possible solution
* NEVER enter infinite retry/self-healing loops
* Ask before executing commands that may modify files or system state

File Modification Rules:

* When encoding issues are detected, prefer using Python for file modification
* Avoid PowerShell for encoding-sensitive text replacement
* Be careful with Chinese characters and BOM handling

Response Style:

* Pragmatic and engineering-oriented
* Concise and direct
* Prioritize conclusions and root-cause analysis
* Avoid excessive conversational filler

Clarification Rules:

* When requirements, business logic, expected behavior, input/output format, scope, or target files are unclear, ask clarifying questions first.
* Do NOT make assumptions for ambiguous requirements unless explicitly authorized.
* Prefer obtaining missing information before generating code, modification plans, or execution steps.
* If multiple reasonable interpretations exist, list them and ask the user to choose.
* For high-impact operations (file modification, database operations, Teamcenter customization, deployment, build, deletion, migration, etc.), clarify uncertainties before proceeding.
* If confidence in requirement understanding is below 90%, ask questions first rather than directly implementing.
