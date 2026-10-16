// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {VpnCommand} from "./VpnCommand";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each([false,true])("copies the exact command with inline=%s and announces success",async inline=>{
 const writeText=vi.fn().mockResolvedValue(undefined);
 vi.stubGlobal("navigator",{clipboard:{writeText}});
 render(<VpnCommand value={inline?"ping 10.8.0.1":"sudo wg-quick up ./khctf.conf"} inline={inline}/>);
 const button=screen.getByRole("button",{name:/Скопіювати команду/});
 expect(button.hasAttribute("title")).toBe(false);
 expect(button.querySelector("svg")===null).toBe(inline);
 fireEvent.click(button);
 await vi.waitFor(()=>expect(writeText).toHaveBeenCalledWith(inline?"ping 10.8.0.1":"sudo wg-quick up ./khctf.conf"));
 expect(await screen.findByRole("status")).toHaveTextContent("Скопійовано");
});
it("reports denied clipboard access without claiming success",async()=>{
 vi.stubGlobal("navigator",{clipboard:{writeText:vi.fn().mockRejectedValue(new Error("denied"))}});
 render(<VpnCommand value="ping 10.8.0.1" inline/>);
 fireEvent.click(screen.getByRole("button",{name:/Скопіювати команду/}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Не вдалося скопіювати");
 expect(screen.queryByRole("status")).toBeNull();
});
