import test from "node:test";
import assert from "node:assert/strict";
import { ProcessCpuReader,pidIsValid,parsePidStatFile } from "./ProcessCpuReader.js";
import { generateStatSample } from "../../../utils/test-utils.js";
import process from "node:process";
import { writeFile,rm,mkdir } from "node:fs/promises";
import os from "node:os";
/*
test('ProcessCpuReader - pidIsValid', async () => {
    const validPids = [1234, 1, 99999];
    const invalidPids = [0, -1, -100, process.pid, 3.14, NaN];

    for(const pid of validPids) {
        assert.strictEqual(pidIsValid(pid), true, `PID ${pid} should be valid`);
    }
    for(const pid of invalidPids) {
        assert.strictEqual(pidIsValid(pid), false, `PID ${pid} should be invalid`);
    }
});

test('ProcessCpuReader - parsePidStatFile', async () => {
    // Note: This test assumes that the current process exists in /proc
    const currentPid = process.pid;
    const statFilePath = `/proc/${currentPid}/stat`;
    const result = await parsePidStatFile(statFilePath);

    assert.strictEqual(result.ok, true, 'Parsing current process stat file should succeed');
    assert.strictEqual(result.pid, currentPid, 'Parsed PID should match current process PID');
    assert.strictEqual(typeof result.comm, 'string', 'Parsed comm should be a string');
    assert.strictEqual(typeof result.state, 'string', 'Parsed state should be a string');
    assert.strictEqual(typeof result.ppid, 'number', 'Parsed ppid should be a number');
    assert.strictEqual(typeof result.utime, 'bigint', 'Parsed utime should be a bigint');
    assert.strictEqual(typeof result.stime, 'bigint', 'Parsed stime should be a bigint');
});

test('ProcessCpuReader - constructor and error handling', async () => {
    // Valid PID
    const reader = new ProcessCpuReader({ pid: process.pid });
    assert.strictEqual(reader.pid, process.pid, 'Reader PID should match provided PID');

    // Invalid PID
    assert.throws(() => {
        new ProcessCpuReader({ pid: -1 });
    }, /Invalid PID/, 'Constructor should throw for invalid PID');

    // Mismatched PID in statFilePath
    assert.throws(() => {
        new ProcessCpuReader({ pid: 1234, statFilePath: '/proc/5678/stat' });
    }, /does not match provided PID/, 'Constructor should throw for mismatched PID in statFilePath');

    // Invalid statFilePath format
    assert.throws(() => {
        new ProcessCpuReader({ pid: 1234, statFilePath: '/invalid/path/stat' });
    }, /does not match expected format/, 'Constructor should throw for invalid statFilePath format');
});
*/

test('ProcessCpuReader Test Suite', async (t) => {
    await t.test('pidIsValid - Valid and Invalid PIDs', async () => {
        const validPids = [1234, 1, 99999,process.pid];
        const invalidPids = [0, -1, -100, 3.14, NaN];

        for(const pid of validPids) {
            assert.strictEqual(pidIsValid(pid), true, `PID ${pid} should be valid`);
        }
        for(const pid of invalidPids) {
            assert.strictEqual(pidIsValid(pid), false, `PID ${pid} should be invalid`);
        }
    });
    await t.test('parsePidStatFile - Current Process', async () => {
        // Note: This test assumes that the current process exists in /proc
        const currentPid = process.pid;
        const statFilePath = `/proc/${currentPid}/stat`;
        const result = await parsePidStatFile(statFilePath);

        assert.strictEqual(result.ok, true, 'Parsing current process stat file should succeed');
        assert.strictEqual(result.pid, currentPid, 'Parsed PID should match current process PID');
        assert.strictEqual(typeof result.comm, 'string', 'Parsed comm should be a string');
        assert.strictEqual(typeof result.state, 'string', 'Parsed state should be a string');
        assert.strictEqual(typeof result.ppid, 'number', 'Parsed ppid should be a number');
        assert.strictEqual(typeof result.utime, 'bigint', 'Parsed utime should be a bigint');
        assert.strictEqual(typeof result.stime, 'bigint', 'Parsed stime should be a bigint');
    });
    await t.test('ProcessCpuReader - constructor and error handling', async () => {
        // Valid PID
        const reader = new ProcessCpuReader({ pid: process.pid });
        assert.strictEqual(reader.pid, process.pid, 'Reader PID should match provided PID');
        
        // Invalid PID
        assert.throws(() => {
            new ProcessCpuReader({ pid: -1 });
        }, /Invalid PID/, 'Constructor should throw for invalid PID');

        // Mismatched PID in statFilePath
        assert.throws(() => {
            new ProcessCpuReader({ pid: 1234, statFilePath: '/proc/5678/stat' });
        }, /does not match provided PID/, 'Constructor should throw for mismatched PID in statFilePath');

        // Invalid statFilePath format
        assert.throws(() => {
            new ProcessCpuReader({ pid: 1234, statFilePath: '/invalid/path/stat' });
        }, /does not match expected format/, 'Constructor should throw for invalid statFilePath format'); 
         
    });

    await t.test('ProcessCpuReader - sample method', async () => {
        const reader = new ProcessCpuReader({ pid: process.pid });
        const sample = await reader.sample();
        assert.strictEqual(sample.ok, true, 'Sample should succeed');
    });

    await t.test('ProcessCpuReader - sample must reflect process CPU usage', async () => {
        const fakeStat1 = generateStatSample({ pid: process.pid, utime: 100, stime: 50, starttime: 1000, delay: 0 });
        const fakeStat2 = generateStatSample({ pid: process.pid, utime: 200, stime: 150, starttime: 1000, delay: 100 });
        const tempDir =  os.tmpdir();
        const statFilePath = `${tempDir}/proc/${process.pid}/stat`;
        await mkdir(`${tempDir}/proc/${process.pid}`, { recursive: true });

        try {
            // Write first fake stat
            await writeFile(statFilePath, fakeStat1, 'utf-8');
            const reader = new ProcessCpuReader({ pid: process.pid, statFilePath });
            const sample1 = await reader.sample();
            assert.strictEqual(sample1.ok, true, 'First sample should succeed');

            // Wait for some time
            await new Promise(resolve => setTimeout(resolve, 100));

            // Write second fake stat
            await writeFile(statFilePath, fakeStat2, 'utf-8');
            const sample2 = await reader.sample();
            assert.strictEqual(sample2.ok, true, 'Second sample should succeed');

            assert.ok(sample1.primed === false, 'First sample should not be primed');
            assert.ok(sample2.primed === true, 'Second sample should be primed');
            assert.ok(Number(sample1.cpuTicks.deltaActive) >= 0, 'First sample deltaActive should be equal 0');
            assert.ok(Number(sample2.cpuTicks.deltaActive) > Number(sample1.cpuTicks.deltaActive), 'Second sample deltaActive should be greater than first sample');
            
            // Note: We cannot assert exact CPU usage percentage without real timing, but we can check deltas
        } finally {
            // Clean up
            await rm(statFilePath).catch(() => {});
        }
      
    });  


    await t.test('ProcessCpuReader - sample pid restart', async () => {
        const fakeStat1 = generateStatSample({ pid: 99999, utime: 100, stime: 50, starttime: 1000, delay: 0 });
        const fakeStat2 = generateStatSample({ pid: 99999, utime: 200, stime: 150, starttime: 2000, delay: 100 }); // Note the changed starttime
        const tempDir =  os.tmpdir();
        const statFilePath = `${tempDir}/proc/99999/stat`;
        await mkdir(`${tempDir}/proc/99999`, { recursive: true });

        try {
            // Write first fake stat
            await writeFile(statFilePath, fakeStat1, 'utf-8');
            const reader = new ProcessCpuReader({ pid: 99999, statFilePath });
            const sample1 = await reader.sample();
            assert.strictEqual(sample1.ok, true, 'First sample should succeed');

            // Wait for some time
            await new Promise(resolve => setTimeout(resolve, 100));

            // Write second fake stat with changed starttime to simulate restart
            await writeFile(statFilePath, fakeStat2, 'utf-8');
            const sample2 = await reader.sample();
            assert.strictEqual(sample2.ok, true, 'Second sample should succeed');

            assert.ok(sample1.primed === false, 'First sample should not be primed');
            assert.ok(sample2.primed === false, 'Second sample should not be primed due to restart');
            assert.strictEqual(sample2.cpuTicks.deltaActive, 0n, 'Delta active ticks should be 0 after restart');
            
        } finally {
            // Clean up
            await rm(statFilePath).catch(() => {});
        }
      
    });
    
    await t.test('ProcessCpuReader - sample method with no existing stat file', async () => {
        const reader = new ProcessCpuReader({ pid:999999999, statFilePath: '/proc/999999999/stat' });
        const sample = await reader.sample();
        assert.strictEqual(sample.ok, false, 'Sample should fail for invalid stat file');
        assert.strictEqual(sample.error, 'file_not_found', 'Error should indicate file not found');
    });

});
    
