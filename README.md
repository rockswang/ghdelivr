# ghdelivr
自动刷新jsdelivr CDN缓存，帮助你更有效率的利(bai)用(piao) Github的存储空间和jsdelivr cdn的带宽流量。

## 原理
在神州大地上，因为众所周知的原因，github访问的速度很慢，甚至有时候会完全中断，让我们没法愉快的利用github提供的优质仓储。  
好在有了jsdelivr，免费为github所有的仓库做CDN，连国内都可以极速访问！  
不过jsdelivr还有个小小的问题，就是不能及时刷新缓存，github仓库更新后，缓存会在24小时内刷新。  
一般的CDN会提供强制刷新/回源(purge)机制，然而为了防止滥用，jsdelivr并没有开放此API，据说需要写邮件给jsdelivr说明原因才能开通，让一众白嫖怪们不禁抚掌兴叹。  
还好，还有个窗户可以爬，可以达到类似强制刷新的效果，就是github仓库更新后，创建一个新的release，然后用`https://cdn.jsdelivr.net/gh/user/repo@tag/path/to/resource`的方法请求资源，其中tag就是release的名字。  

本项目就是基于这个机制：
1. 监听Github的Webhook，当接收到仓库的push事件时，立即调用Github API自动创建一个新的release。
1. 外部应用引用仓库资源时，可以使用指向本服务的固定URL，本服务解析该URL，将其映射为添加了最新的release版本的CDN地址并自动跳转。
1. 本服务中对仓库和release之间有内存缓存，即使不配置Webhook，也可做到10分钟内刷新。

## 使用步骤
强烈建议你clone本仓库并在你自己的服务器上本地部署。  
少量使用可以直接使用这个地址：`http://gh.qbot.fun/`。  
这是作者本人的服务器，如果发现服务不可用，请**QQ联系17219193**。  
以下步骤皆以此地址作为例子。
1. Github账户中添加Token:
    1. Github任意页面中，依次点击：右上角头像 -> Settings -> Developer Settings -> Personal access tokens
    2. 点击Generate new token
    3. Notes中随便输入个名字，Select scopes中，确保repo及其子项目全部选中，然后点击Generate Token
    4. 把产生的token，一个40位的16进制字符串记住。**重要：此token只显示这一次，如果没记住只能删除重建**
1. 调用下面的API添加Github账户名和对应的Token：  
  `http://gh.qbot.fun/addToken?user=Github账户名&token=上步获取的Token`
  本项目需要使用此Token调用Github API以刷新release
1. 为Github仓库创建Webhook:
    1. Github仓库页面中，依次点击：Settings -> Webhooks
    1. 点击Add webhook
    1. 页面中：Payload URL填入`http://gh.qbot.fun/webhook`，Content type选择application/json；其它项目保持默认，点击Add webhook
    1. 添加成功后会立即向Webhook地址推送一次，你可以在下面的Recent Deliveries中看到最近的推送日志；  
      点击右面的三点按钮，即可看到推送的请求和应答日志，正常的应答body应该是`ok`或`no commit`
1. 至此，仓库任意资源即可访问！  
  仓库内的任意资源地址做如下映射即可正常使用：  
  `https://github.com/user/repo/path/to/resource` -> `http://gh.qbot.fun/user/repo/path/to/resource`  
  注意：  
    1. 此地址返回的是一个302跳转，将重定向到jsdelivr上对应资源的最新release版的URL上去，即`https://cdn.jsdelivr.net/gh/user/repo@release/path/to/resource`
    1. 首次访问会创建release，jsdelivr也需回源，会比较慢，以后就会非常快了  
  仓库中有任何添加、修改、删除等动作，CDN都会实时刷新！  
  
1. 也可以不用服务提供的跳转机制，而是在客户端自行组装资源URL，这样速度更快，推荐用此方案！  
  访问`http://gh.qbot.fun/user/repo/`即会返回当前的最新release的tag  
  客户端可以缓存此tag，并自行拼装最终资源地址，即：  
  `https://cdn.jsdelivr.net/gh/user/repo@release/path/to/resource`

## 其它说明
* 感谢Github无私的提供免费存储空间，感谢jsdelivr无私的提供免费带宽流量！
* 请勿过于频繁的向资源仓库中推送更新，导致release过于频繁的刷新，从而让jsdelivr不堪其负乃至最后关闭了这个免费服务！
* 作者提供的服务器是1M带宽的腾讯学生机，难堪伐挞，仅供测试或少量使用，强烈建议您在自己的服务器上本地部署！
* 从国内访问Github API很不稳定，因此本项目中使用了梯子，如果你可以部署在海外服务器上，则可以删除利用代理的部分代码。
