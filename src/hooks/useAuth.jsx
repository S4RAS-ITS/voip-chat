import { useState, useEffect, useRef } from "react";
import { useKeycloakStore, useUserInfoStore, useUserVoipStore } from '../store/useStore';
import { emailToVoipExtension } from '../utils/userPhone';
import Keycloak from "keycloak-js";

const useAuth = () => {
  const isRun = useRef(false);
  const {setKeycloakClient} = useKeycloakStore();
  const {setUserInfo} = useUserInfoStore();
  const {setUserVoip} = useUserVoipStore();
  const [isLogin, setLogin] = useState(false);

  useEffect(() => {
    if (isRun.current) return;

    const client = new Keycloak({
      url: 'https://keycloak.portal-saras.com',
      realm: 'S4RAS',
      clientId: 'front-end',
    });

    isRun.current = true;
    client
      .init({
        onLoad: 'login-required',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      })
      .then((res) => {
        setKeycloakClient(client);

        client.loadUserInfo().then((info) => {
            setUserInfo(info);
            setLogin(res);
            
            emailToVoipExtension(info.email).then((phoneNumber) => {
              setUserVoip(phoneNumber)
            })
        })
      });
  }, []);

  return [isLogin];
};

export default useAuth;