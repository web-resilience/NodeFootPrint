import test from "node:test";
import assert from "node:assert/strict";
import { splitCommand,extractVerbosity } from "./command/command-utils.js";

test("splitCommand: empty / whitespace", () => {
  assert.deepEqual(splitCommand(""), []);
  assert.deepEqual(splitCommand("   \t\n  "), []);
});

test("splitCommand: basic splitting", () => {
  assert.deepEqual(splitCommand("node script.js"), ["node", "script.js"]);
  assert.deepEqual(splitCommand("node   script.js   --x  1"), ["node", "script.js", "--x", "1"]);
});

test("splitCommand: single quotes", () => {
  assert.deepEqual(splitCommand("echo 'hello world'"), ["echo", "hello world"]);
  assert.deepEqual(splitCommand("cmd '' end"), ["cmd", "", "end"]);
});

test("splitCommand: double quotes", () => {
  assert.deepEqual(splitCommand('echo "hello world"'), ["echo", "hello world"]);
  assert.deepEqual(splitCommand('cmd "" end'), ["cmd", "", "end"]);
});

test("splitCommand: quotes inside token", () => {
  assert.deepEqual(
    splitCommand('node script.js --name="hello world" --x=1'),
    ["node", "script.js", "--name=hello world", "--x=1"]
  );
});

test("splitCommand: mixed quotes", () => {
  assert.deepEqual(
    splitCommand(`node -e "console.log('hi')" --msg 'ok'`),
    ["node", "-e", "console.log('hi')", "--msg", "ok"]
  );
});

test("splitCommand: escapes outside quotes", () => {
  assert.deepEqual(splitCommand(String.raw`echo hello\ world`), ["echo", "hello world"]);
  assert.deepEqual(splitCommand(String.raw`echo \"quote\"`), ["echo", `"quote"`]);
  assert.deepEqual(splitCommand(String.raw`path C:\\Windows\\System32`), ["path", "C:\\Windows\\System32"]);
});

test("splitCommand: escapes inside double quotes", () => {
  assert.deepEqual(
    splitCommand(String.raw`echo "a \"b\" c"`),
    ["echo", `a "b" c`]
  );
  assert.deepEqual(
    splitCommand(String.raw`echo "C:\\Temp\\file.txt"`),
    ["echo", 'C:\\Temp\\file.txt']
  );
});

test("splitCommand: forgiving single quote escape", () => {
  assert.deepEqual(
    splitCommand(String.raw`echo 'it\'s ok'`, { forgiving: true }),
    ["echo", "it's ok"]
  );
});

test("splitCommand: unclosed quotes throw", () => {
  assert.throws(() => splitCommand(`echo "oops`), /unclosed double quote/);
  assert.throws(() => splitCommand(`echo 'oops`), /unclosed single quote/);
});

test("splitCommand: realistic --spawn examples", () => {
  assert.deepEqual(
    splitCommand(`node script.js --iterations 250000 --loops 200`),
    ["node", "script.js", "--iterations", "250000", "--loops", "200"]
  );

  assert.deepEqual(
    splitCommand(`node -e "console.log('hello world')"`),
    ["node", "-e", "console.log('hello world')"]
  );
});

test('extractVerbosity', async () => {
    const rest = ['node','script.js','--pid','123'];
    assert.deepStrictEqual(extractVerbosity(["node","script.js", "--pid","123", "--verbose"]),{
        level:1,
        debugMetaExplicit:false,
        rest
    });
    
    assert.deepStrictEqual(extractVerbosity(["node","script.js", "--pid","123", "--debug-meta"]),{
        level:0,
        debugMetaExplicit:true,
        rest
    });
    
    assert.deepStrictEqual(extractVerbosity(["node","script.js", "--pid","123", "-v"]),{
        level:1,
        debugMetaExplicit:false,
        rest
    });
    
    assert.deepStrictEqual(extractVerbosity(["node","script.js", "--pid","123", "-vv"]),{
        level:2,
        debugMetaExplicit:false,
        rest
    });
    
});
