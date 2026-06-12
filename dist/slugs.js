"use strict";
// Absurdly funny tech slugs.
// Humor comes from mixing wildly different abstraction levels and domains.
// Each word is a real tech term. The COMBINATION is the joke.
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSlug = createSlug;
const adjectives = [
    // states & conditions
    "volatile", "atomic", "idempotent", "eventual", "linearizable", "lazy", "eager", "strict", "loose",
    "sticky", "greedy", "speculative", "deterministic", "nondeterministic", "reactive", "proactive",
    "hot", "cold", "warm", "lukewarm", "frozen", "melting", "burning", "crispy",
    // memory states
    "null", "nil", "undefined", "nan", "infinity", "leaked", "dangling", "orphaned", "zombie", "freed",
    "doublefreed", "unreferenced", "uninitialized", "zeroed", "unmapped", "pinned", "swapped", "paged",
    // concurrency states
    "deadlocked", "starved", "racy", "lockfree", "waitfree", "blocked", "contended", "queued",
    // storage states
    "corrupted", "fragmented", "defragmented", "compacted", "deduplicated", "sparse", "dense", "compressed",
    "encrypted", "signed", "unsigned", "tampered", "bitrotted",
    // network states
    "natted", "firewalled", "airgapped", "mitmed", "throttled", "backlogged", "congested", "jittery", "laggy",
    // lifecycle states
    "deprecated", "obsoleted", "legacied", "vendored", "forked", "unforked", "rebased", "squashed",
    "stashed", "cherrypicked", "bisected", "reverted", "amended",
    // security states
    "sandboxed", "jailed", "chrooted", "containerized", "namespaced", "cgrouped", "seccomped", "selinuxed",
    "rooted", "unrooted", "bricked", "pwned", "escalated",
    // physical-ish
    "baremetal", "headless", "diskless", "stateless", "stateful", "grounded", "floating",
    // funny modifiers
    "asymmetric", "homomorphic", "zeroknowledge", "multicloud", "serverless", "edge", "fog", "mesh",
    "chonky", "thicc", "smol", "thunked", "curried", "partial", "hoisted", "coerced", "casted",
    "promisified", "denied", "forbidden", "unauthorized",
    "immutable", "mutable", "readonly", "writeonly", "appendonly", "cow",
];
const nouns = [
    // hardware
    "cpu", "gpu", "tpu", "fpga", "asic", "mcu", "dsp", "soc", "ram", "rom",
    "cachelane", "tlbentry", "pagetable", "branchpredictor", "regfile", "alu", "fpu",
    "northbridge", "southbridge", "dma", "irq", "nvmequeue", "sataport",
    "heatsink", "led", "jtag", "bootrom",
    // os internals
    "kernel", "pid", "inode", "superblock", "journal", "pagefault",
    "syscall", "trapframe", "coredump", "oomkiller", "swapspace",
    "init", "zombie", "cgroup", "namespace", "bpfprogram", "iptables",
    "netfilter", "vethpair", "pidfd", "signalfd", "eventfd", "timerfd",
    // networking
    "synpacket", "ackflag", "mtu", "bgpsession", "dnsquery",
    "tlscert", "x509chain", "ocspstaple", "dnsseckey",
    "arptable", "macaddr", "iproute", "natrule", "vlantag", "vxlantunnel",
    // storage
    "walrecord", "snapshot", "backup",
    "lvmvolume", "zfspool", "btrfsvolume", "raidarray",
    "fsync", "msync", "barrier",
    // crypto
    "aeskey", "rsakey", "ecdsasig", "hmacdigest", "bcrypthash", "scryptnonce",
    "x25519keypair", "ed25519sig", "argon2idhash",
    // data structures
    "btreenode", "redblacktree", "hashtable", "bloomfilter", "hashchain",
    "merkletree", "patriciatric", "rope", "splaytree", "cuckootable",
    // k8s
    "pod", "deployment", "statefulset", "daemonset", "cronjob", "configmap",
    "ingress", "serviceaccount", "clusterrole", "pdb", "hpa", "pvc",
    "helmrelease", "crd", "operator", "webhook",
    // dev tools
    "rebase", "mergeconflict", "cherrypick", "lockfile", "workspace", "artifact",
    "flakytest", "heapdump", "flamegraph", "tracespan",
    // web
    "corsheader", "etag", "cookie", "jwttoken", "session", "webhookpayload",
    "graphqlschema", "restendpoint", "ssestream", "wsframe",
    // misc
    "yamlindent", "tabwidth", "lineending", "nullbyte",
    "shebang", "dockerlayer", "baseimage", "scratchpad",
    "bufferoverflow", "useafterfree", "racecondition", "heisenbug",
    "bitflip", "cosmicray", "rowhammer",
    "spectre", "meltdown", "zombieload", "plundervolt",
    "stackprotector", "canary", "shadowstack",
];
const verbs = [
    // human actions on tech (the funny ones — weight heavily)
    "cuddles", "yellsat", "sideeyes", "gaslights", "ghosts", "nomnoms", "horks",
    "yeets", "wobbles", "barfs", "sneezes", "hallucinates", "asserts", "complains",
    "judges", "praises", "blames", "apologizes", "staresat", "whispersat",
    "memeifies", "gitignores", "rmrfs", "forcepushes", "amegdeletes",
    "shadowbans", "cancels", "vetoed", "fines", "vaporizes", "enchants",
    "polymorphs", "reincarnates", "teleports", "phases-through", "nanodresses",
    "shreds", "blenderifies", "fractalizes", "recurses", "derps",
    "copes", "seethes", "malds", "pepes", "reees", "gits", "keks",
    "chefkisses", "taps", "headpats", "boops",
    // tech actions
    "segfaults", "pagefaults", "doublefrees", "overflows", "smashes",
    "nullrefds", "dividesbyzero", "shiftsby64", "underflows",
    "garbles", "corrupts", "bitrots", "deadlocks", "starves",
    "leaks", "thrashes", "ooms", "panics", "bsods",
    // network absurdity
    "ddoses", "arp poisons", "bgphijacks", "dnspoisons", "mitms",
    // deployment absurdity
    "hotswaps", "hotpatches", "bluegreens", "canaries", "rollbacks",
    "redeploys", "squashes", "launches", "chaosmonkeys", "loadtests",
    // compile/runtime
    "jits", "aots", "transpiles", "treeshakes", "inlines", "vectorizes",
    "unrolls", "mispredicts", "flushes",
    // data
    "reindexes", "vacuums", "reshards", "rebalances",
    // lifecycle
    "spawns", "forks", "execs", "reaps", "zombifies",
    // boot
    "boots", "reboots", "catchesfire", "triplefaults", "doublefaults",
    "haltandcatchesfire",
];
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function clean(word) {
    return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function createSlug() {
    const adj = clean(pick(adjectives));
    const noun = clean(pick(nouns));
    const verb = clean(pick(verbs));
    return `${adj}-${noun}-${verb}`;
}
