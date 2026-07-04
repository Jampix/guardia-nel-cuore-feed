import { parseArgs } from '../../bin/infra-dlc-guard';

describe('Infra-DLC guard — parseArgs', () => {
  it('estrae stack posizionale e flag', () => {
    const a = parseArgs(['MyStack', '--profile', 'dev', '--env', 'staging', '--execute-if-clean']);
    expect(a.stack).toBe('MyStack');
    expect(a.profile).toBe('dev');
    expect(a.env).toBe('staging');
    expect(a.executeIfClean).toBe(true);
    expect(a.warnOnly).toBe(false);
    expect(a.keepChangeSet).toBe(false);
  });

  it('default booleani a false e stack assente', () => {
    const a = parseArgs([]);
    expect(a.stack).toBeUndefined();
    expect(a.executeIfClean).toBe(false);
    expect(a.warnOnly).toBe(false);
    expect(a.keepChangeSet).toBe(false);
  });

  it('prende solo il primo posizionale come stack', () => {
    const a = parseArgs(['StackA', 'StackB', '--warn-only', '--keep-change-set']);
    expect(a.stack).toBe('StackA');
    expect(a.warnOnly).toBe(true);
    expect(a.keepChangeSet).toBe(true);
  });
});
