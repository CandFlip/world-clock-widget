package com.candflip.worldclockalarm;

import android.os.Build;
import org.json.JSONObject;
import java.io.IOException;
import java.util.concurrent.TimeUnit;
import okhttp3.*;

final class Api {
    static final String BASE="https://world-clock-widget-sync.uuuraaaaa.workers.dev";
    static final OkHttpClient HTTP=new OkHttpClient.Builder().pingInterval(25,TimeUnit.SECONDS).build();
    static JSONObject pair(String token) throws Exception {
        JSONObject body=new JSONObject().put("token",token).put("device_name",Build.MANUFACTURER+" "+Build.MODEL).put("language","ru");
        return request("POST","/api/mobile/pair","",body);
    }
    static JSONObject status(String credential) throws Exception { return request("GET","/api/device/status",credential,null); }
    static JSONObject action(String credential,String id,String action,int minutes) throws Exception {
        return request("POST","/api/device/action",credential,new JSONObject().put("reminder_id",id).put("action",action).put("minutes",minutes));
    }
    static void disconnect(String credential) throws Exception { request("POST","/api/device/disconnect",credential,new JSONObject()); }
    static Request wsRequest(String credential){
        return new Request.Builder().url(BASE.replace("https://","wss://")+"/api/device/events/ws")
                .header("Sec-WebSocket-Protocol","wcc-sync, "+credential).build();
    }
    private static JSONObject request(String method,String path,String credential,JSONObject body) throws Exception {
        RequestBody rb=body==null?null:RequestBody.create(body.toString(),MediaType.get("application/json; charset=utf-8"));
        Request.Builder b=new Request.Builder().url(BASE+path);
        if(!credential.isEmpty()) b.header("Authorization","Bearer "+credential);
        if(method.equals("GET")) b.get(); else b.method(method,rb);
        try(Response r=HTTP.newCall(b.build()).execute()){
            String text=r.body()==null?"{}":r.body().string();
            if(!r.isSuccessful()) throw new IOException("HTTP "+r.code()+": "+text);
            return new JSONObject(text);
        }
    }
}
